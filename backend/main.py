from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional
from fastapi.responses import JSONResponse
import base64
from io import BytesIO
from .wsitools import extract_roi, apply_threshold, apply_morphology, generate_dzi
from PIL import Image
import os
from sklearn.linear_model import LogisticRegression
import numpy as np
import pickle
from sklearn.metrics import log_loss
import logging

app = FastAPI()

# Allow CORS for local frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)
TILES_DIR = "tiles"
os.makedirs(TILES_DIR, exist_ok=True)
app.mount("/tiles", StaticFiles(directory=TILES_DIR), name="tiles")
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(),
        # logging.FileHandler("app.log"),  # Uncomment to log to a file
    ]
)
logger = logging.getLogger(__name__)

@app.get("/health")
def health_check():
    return {"status": "ok"}

class ROIBox(BaseModel):
    x: int
    y: int
    width: int
    height: int

class ROIRequest(BaseModel):
    wsi_path: str
    rois: list[ROIBox]
    threshold_type: str
    morph_ops: List[str]
    morph_kwargs: Optional[dict] = None

@app.post("/process_roi")
def process_roi(request: ROIRequest):
    try:
        logger.info(f"Received ROI request: wsi_path={request.wsi_path}, rois={request.rois}, threshold_type={request.threshold_type}, morph_ops={request.morph_ops}, morph_kwargs={request.morph_kwargs}")
        if not os.path.exists(request.wsi_path):
            logger.error(f"File not found: {request.wsi_path}")
            raise HTTPException(status_code=404, detail="WSI file not found.")
        if not request.rois or len(request.rois) == 0:
            logger.error("No ROIs provided in request.")
            raise HTTPException(status_code=400, detail="No ROIs provided. Please select at least one ROI.")
        results = []
        for roi in request.rois:
            logger.info(f"Processing ROI: x={roi.x}, y={roi.y}, w={roi.width}, h={roi.height}")
            if roi.width <= 0 or roi.height <= 0:
                logger.error(f"Invalid ROI size: x={roi.x}, y={roi.y}, w={roi.width}, h={roi.height}")
                raise HTTPException(status_code=400, detail=f"Invalid ROI size: width and height must be > 0 (got w={roi.width}, h={roi.height})")
            logger.info(f"Extracting ROI: {request.wsi_path}, x={roi.x}, y={roi.y}, w={roi.width}, h={roi.height}")
            region = extract_roi(request.wsi_path, roi.x, roi.y, roi.width, roi.height)
            manual_value = request.morph_kwargs.get('manual_value') if request.morph_kwargs else None
            logger.info(f"Applying threshold: {request.threshold_type}, manual_value={manual_value}")
            binary = apply_threshold(region, request.threshold_type, manual_value)
            morph_kwargs = request.morph_kwargs or {}
            logger.info(f"Applying morphology: {request.morph_ops}, kwargs={morph_kwargs}")
            morphed = apply_morphology(binary, request.morph_ops, morph_kwargs)
            # Get segmented RGB values where mask is True
            mask = morphed > 0
            rgb_pixels = region[mask]
            # Return both the mask image and the RGB values
            img = Image.fromarray(morphed)
            buffered = BytesIO()
            img.save(buffered, format="PNG")
            img_str = base64.b64encode(buffered.getvalue()).decode()
            results.append({
                "mask": img_str,
                "rgb": rgb_pixels.tolist()
            })
        return {"results": results}
    except HTTPException as he:
        # Let FastAPI handle HTTPExceptions as intended
        raise he
    except ValueError as ve:
        logger.error(f"ValueError: {ve}")
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"Processing error: {e}")
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Processing error: {str(e)}")

@app.post("/upload_wsi")
def upload_wsi(file: UploadFile = File(...)):
    try:
        if not file.filename:
            raise HTTPException(status_code=400, detail="No file uploaded.")
        file_location = os.path.join(UPLOAD_DIR, file.filename)
        # Stream the uploaded file to disk in chunks to avoid loading the whole
        # file into memory. This is important for large WSI files (hundreds of MBs).
        with open(file_location, "wb") as f:
            for chunk in iter(lambda: file.file.read(1024 * 1024), b""):  # 1 MB chunks
                f.write(chunk)
        return {"wsi_path": file_location}
    except HTTPException as he:
        logger.error(f"Upload error: {he.detail}")
        raise he
    except Exception as e:
        logger.error(f"Upload error: {e}")
        raise HTTPException(status_code=500, detail=f"Upload error: {str(e)}")

@app.get("/list_uploads")
def list_uploads():
    try:
        files = [f for f in os.listdir(UPLOAD_DIR) if os.path.isfile(os.path.join(UPLOAD_DIR, f))]
        return {"files": files}
    except HTTPException as he:
        logger.error(f"Listing error: {he.detail}")
        raise he
    except Exception as e:
        logger.error(f"Listing error: {e}")
        raise HTTPException(status_code=500, detail=f"Listing error: {str(e)}")

@app.post("/tile_wsi")
def tile_wsi(request: Request, wsi_path: str = Form(...)):
    try:
        dzi_path = generate_dzi(wsi_path, TILES_DIR)
        dzi_name = os.path.basename(dzi_path)
        host = request.base_url
        dzi_url = f"{host}tiles/{os.path.splitext(dzi_name)[0]}.dzi"
        return {"dzi_url": dzi_url}
    except HTTPException as he:
        logger.error(f"Tiling error: {he.detail}")
        raise he
    except Exception as e:
        import traceback
        logger.error(f"Tiling error: {e}")
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Tiling error: {str(e)}")

# In-memory model store (for demo)
MODELS = {}

class TrainRequest(BaseModel):
    rgb: list[list[list[int]]]
    labels: list[int]

@app.post("/train_model")
def train_model(request: TrainRequest):
    try:
        X = np.concatenate([np.array(rgb) for rgb in request.rgb], axis=0)
        y = np.concatenate([[label]*len(rgb) for rgb, label in zip(request.rgb, request.labels)], axis=0)
        model = LogisticRegression(max_iter=1, warm_start=True, solver='saga')
        losses = []
        for i in range(20):  # 20 epochs
            model.fit(X, y)
            y_pred_prob = model.predict_proba(X)
            loss = log_loss(y, y_pred_prob)
            losses.append(loss)
        model_id = str(len(MODELS))
        MODELS[model_id] = pickle.dumps(model)
        logger.info(f"Model trained: {model_id}, losses: {losses}")
        return {"model_id": model_id, "loss_history": losses}
    except HTTPException as he:
        logger.error(f"Training error: {he.detail}")
        raise he
    except Exception as e:
        logger.error(f"Training error: {e}")
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Training error: {str(e)}")

class PredictRequest(BaseModel):
    model_id: str
    rgb: list[list[int]]

@app.post("/predict_model")
def predict_model(request: PredictRequest):
    try:
        if request.model_id not in MODELS:
            logger.error(f"Model not found: {request.model_id}")
            raise HTTPException(status_code=404, detail="Model not found.")
        model = pickle.loads(MODELS[request.model_id])
        X = np.array(request.rgb)
        preds = model.predict(X)
        logger.info(f"Prediction for model {request.model_id}: {preds.tolist()}")
        return {"predictions": preds.tolist()}
    except HTTPException as he:
        logger.error(f"Prediction error: {he.detail}")
        raise he
    except Exception as e:
        logger.error(f"Prediction error: {e}")
        import traceback; traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Prediction error: {str(e)}") 