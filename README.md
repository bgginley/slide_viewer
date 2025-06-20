# WSI ROI Processing Platform Backend

## Setup

1. Install dependencies:
   ```bash
   pip install -r backend/requirements.txt
   ```
2. Run the backend server:
   ```bash
   uvicorn backend.main:app --reload
   ```

## API Endpoints

### 1. Upload WSI
- **POST** `/upload_wsi`
- **Body:** Multipart form with file
- **Response:** `{ "wsi_path": "uploads/filename.svs" }`
- **Example:**
  ```bash
  curl -F "file=@/path/to/your/file.svs" http://localhost:8000/upload_wsi
  ```

### 2. List Uploaded WSIs
- **GET** `/list_uploads`
- **Response:** `{ "files": ["file1.svs", "file2.svs"] }`
- **Example:**
  ```bash
  curl http://localhost:8000/list_uploads
  ```

### 3. Process ROI
- **POST** `/process_roi`
- **Body:** JSON
  ```json
  {
    "wsi_path": "uploads/yourfile.svs",
    "rois": [
      {"x": 1000, "y": 1000, "width": 512, "height": 512},
      {"x": 2000, "y": 2000, "width": 256, "height": 256}
    ],
    "threshold_type": "otsu", // or "adaptive", "manual"
    "morph_ops": ["erosion", "dilation"],
    "morph_kwargs": {"manual_value": 128}
  }
  ```
- **Response:** `{ "results": [ { "mask": "<base64 PNG>", "rgb": [[r,g,b], ...] }, ... ] }`
- **Example:**
  ```bash
  curl -X POST http://localhost:8000/process_roi \
    -H "Content-Type: application/json" \
    -d '{
      "wsi_path": "uploads/yourfile.svs",
      "rois": [
        {"x": 1000, "y": 1000, "width": 512, "height": 512},
        {"x": 2000, "y": 2000, "width": 256, "height": 256}
      ],
      "threshold_type": "otsu",
      "morph_ops": ["erosion", "dilation"],
      "morph_kwargs": {"manual_value": 128}
    }'
  ```

### 4. Train Model
- **POST** `/train_model`
- **Body:** JSON
  ```json
  {
    "rgb": [ [[r,g,b], ...], ... ],
    "labels": [0, 1, ...]
  }
  ```
- **Response:** `{ "model_id": "0", "loss_history": [ ... ] }`

### 5. Predict Model
- **POST** `/predict_model`
- **Body:** JSON
  ```json
  {
    "model_id": "0",
    "rgb": [[r,g,b], ...]
  }
  ```
- **Response:** `{ "predictions": [0, 1, ...] }`

---

## Notes
- All processed images are returned as base64-encoded PNGs.
- Place your WSI files in the `uploads/` directory or use the upload endpoint. 