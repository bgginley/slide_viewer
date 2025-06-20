import openslide
import numpy as np
from PIL import Image
from skimage import filters, morphology, img_as_ubyte
import subprocess
import os

# Extract ROI from WSI using OpenSlide
def extract_roi(wsi_path, x, y, width, height):
    slide = openslide.OpenSlide(wsi_path)
    region = slide.read_region((x, y), 0, (width, height)).convert('RGB')
    slide.close()
    return np.array(region)

# Apply thresholding
def apply_threshold(image, threshold_type, manual_value=None):
    gray = np.array(Image.fromarray(image).convert('L'))
    if threshold_type == 'otsu':
        thresh_val = filters.threshold_otsu(gray)
        binary = gray > thresh_val
    elif threshold_type == 'adaptive':
        block_size = 35
        binary = filters.threshold_local(gray, block_size)
        binary = gray > binary
    elif threshold_type == 'manual' and manual_value is not None:
        binary = gray > manual_value
    else:
        raise ValueError('Invalid threshold type or missing manual value')
    return img_as_ubyte(binary)

# Apply morphological operations
MORPH_MAP = {
    'erosion': morphology.erosion,
    'dilation': morphology.dilation,
    'opening': morphology.opening,
    'closing': morphology.closing,
}
def apply_morphology(image, morph_ops, morph_kwargs=None):
    morph_kwargs = morph_kwargs or {}
    result = image
    for op in morph_ops:
        func = MORPH_MAP.get(op)
        if func:
            result = func(result, **morph_kwargs.get(op, {}))
    return img_as_ubyte(result)

def generate_dzi(wsi_path, output_dir):
    os.makedirs(output_dir, exist_ok=True)
    dzi_base = os.path.join(output_dir, os.path.splitext(os.path.basename(wsi_path))[0])
    cmd = [
        "vips", "dzsave", wsi_path, dzi_base
    ]
    subprocess.run(cmd, check=True)
    return dzi_base + '.dzi' 