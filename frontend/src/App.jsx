import React, { useState, useEffect, useRef } from 'react';
import { Button, Typography, Box, CircularProgress, Select, MenuItem, FormControl, InputLabel, Checkbox, ListItemText, OutlinedInput, TextField, IconButton, Tooltip, LinearProgress } from '@mui/material';
import axios from 'axios';
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import OpenSeadragon from 'openseadragon';
import CropSquareIcon from '@mui/icons-material/CropSquare';
import DeleteIcon from '@mui/icons-material/Delete';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip, ResponsiveContainer } from 'recharts';

function App() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [error, setError] = useState(null);
  const viewerRef = useRef(null);
  const osdViewer = useRef(null);
  const [roiCoords, setRoiCoords] = useState({ x: '', y: '', width: '', height: '' });
  const [processing, setProcessing] = useState(false);
  const [resultImg, setResultImg] = useState(null);
  const [thresholdType, setThresholdType] = useState('otsu');
  const [morphOps, setMorphOps] = useState([]);
  const [manualValue, setManualValue] = useState(128);
  const [dziUrl, setDziUrl] = useState(null);
  const [dziDims, setDziDims] = useState(null);
  const isDrawing = useRef(false);
  const start = useRef(null);
  const overlayId = 'roi-rectangle';
  const [drawMode, setDrawMode] = useState(false);
  const [rois, setRois] = useState([]);
  const [segResults, setSegResults] = useState([]);
  const [roiLabels, setRoiLabels] = useState([]);
  const [modelId, setModelId] = useState(null);
  const [predictRoiIdx, setPredictRoiIdx] = useState(null);
  const [predictions, setPredictions] = useState([]);
  const [lossHistory, setLossHistory] = useState([]);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleFileChange = (event) => {
    setSelectedFile(event.target.files[0]);
    setError(null);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setError(null);
    setDziUrl(null);
    setUploadProgress(0);
    const formData = new FormData();
    formData.append('file', selectedFile);
    try {
      const response = await axios.post(
        'http://172.21.174.100:8000/upload_wsi',
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total) {
              setUploadProgress(Math.round((progressEvent.loaded * 100) / progressEvent.total));
            }
          }
        }
      );
      setUploadedFile(response.data.wsi_path);
      if (!response.data.wsi_path.endsWith('.jpg') && !response.data.wsi_path.endsWith('.png')) {
        const tileForm = new FormData();
        tileForm.append('wsi_path', response.data.wsi_path);
        const tileResp = await axios.post('http://172.21.174.100:8000/tile_wsi', tileForm);
        setDziUrl(tileResp.data.dzi_url);
      } else {
        setDziUrl(null);
      }
    } catch (err) {
      setError('Upload or tiling failed.');
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    if (dziUrl || (uploadedFile && (uploadedFile.endsWith('.jpg') || uploadedFile.endsWith('.png')))) {
      if (osdViewer.current) {
        osdViewer.current.destroy();
      }
      osdViewer.current = OpenSeadragon({
        element: viewerRef.current,
        prefixUrl: 'https://openseadragon.github.io/openseadragon/images/',
        tileSources: dziUrl ? dziUrl : `http://172.21.174.100:8000/uploads/${uploadedFile.split('/').pop()}`,
        showNavigator: true,
        minZoomLevel: 0.5,
        defaultZoomLevel: 1,
        gestureSettingsMouse: {
          clickToZoom: !drawMode,
          dblClickToZoom: !drawMode,
          dragToPan: !drawMode,
          scrollToZoom: !drawMode,
          pinchToZoom: !drawMode,
        },
      });
      let isDrawing = false;
      let start = null;
      let overlayId = null;
      osdViewer.current.addHandler('canvas-press', function (event) {
        if (!drawMode) return;
        isDrawing = true;
        const webPoint = event.position;
        start = osdViewer.current.viewport.pointFromPixel(webPoint);
        overlayId = `roi-rectangle-temp`;
        osdViewer.current.removeOverlay(overlayId);
      });
      osdViewer.current.addHandler('canvas-drag', function (event) {
        if (!drawMode || !isDrawing || !start) return;
        const webPoint = event.position;
        const end = osdViewer.current.viewport.pointFromPixel(webPoint);
        const x = Math.min(start.x, end.x);
        const y = Math.min(start.y, end.y);
        const w = Math.abs(start.x - end.x);
        const h = Math.abs(start.y - end.y);
        const rect = document.createElement('div');
        rect.style.border = '2px solid #1976d2';
        rect.style.background = 'rgba(25, 118, 210, 0.1)';
        rect.id = overlayId;
        osdViewer.current.removeOverlay(overlayId);
        osdViewer.current.addOverlay({
          element: rect,
          location: new OpenSeadragon.Rect(x, y, w, h),
          id: overlayId,
        });
      });
      osdViewer.current.addHandler('canvas-release', function (event) {
        if (!drawMode || !isDrawing || !start) return;
        isDrawing = false;
        const webPoint = event.position;
        const end = osdViewer.current.viewport.pointFromPixel(webPoint);
        const x = Math.min(start.x, end.x);
        const y = Math.min(start.y, end.y);
        const w = Math.abs(start.x - end.x);
        const h = Math.abs(start.y - end.y);
        
        // Convert normalized coordinates to pixel coordinates
        let pixelX = x, pixelY = y, pixelW = w, pixelH = h;
        if (dziDims) {
          pixelX = Math.round(x * dziDims.width);
          pixelY = Math.round(y * dziDims.height);
          pixelW = Math.round(w * dziDims.width);
          pixelH = Math.round(h * dziDims.height);
        } else {
          // For regular images, get the image dimensions from the viewer
          const imgSize = osdViewer.current.world.getItemAt(0).getContentSize();
          pixelX = Math.round(x * imgSize.x);
          pixelY = Math.round(y * imgSize.y);
          pixelW = Math.round(w * imgSize.x);
          pixelH = Math.round(h * imgSize.y);
        }
        
        if (pixelW > 0 && pixelH > 0) {
          const roi = { x: pixelX, y: pixelY, width: pixelW, height: pixelH };
          console.log('Adding ROI:', roi);
          setRois(prev => [...prev, roi]);
        } else {
          console.warn('Attempted to add ROI with non-positive width or height:', { x: pixelX, y: pixelY, width: pixelW, height: pixelH });
        }
        osdViewer.current.removeOverlay(overlayId);
      });
    }
    return () => {
      if (osdViewer.current) {
        osdViewer.current.destroy();
        osdViewer.current = null;
      }
    };
  }, [uploadedFile, dziUrl, drawMode]);

  useEffect(() => {
    if (dziUrl) {
      axios.get(dziUrl)
        .then(res => {
          const parser = new window.DOMParser();
          const xml = parser.parseFromString(res.data, 'text/xml');
          const imageNode = xml.getElementsByTagName('Image')[0];
          const sizeNode = imageNode.getElementsByTagName('Size')[0];
          setDziDims({
            width: parseInt(sizeNode.getAttribute('Width'), 10),
            height: parseInt(sizeNode.getAttribute('Height'), 10)
          });
        })
        .catch(() => setDziDims(null));
    } else {
      setDziDims(null);
    }
  }, [dziUrl]);

  useEffect(() => {
    if (!osdViewer.current) return;
    // Remove all previous overlays
    rois.forEach((_, i) => osdViewer.current.removeOverlay(`roi-rectangle-${i}`));
    // Add overlays for all ROIs
    rois.forEach((roi, i) => {
      const rect = document.createElement('div');
      rect.style.border = '2px solid #d32f2f';
      rect.style.background = 'rgba(211, 47, 47, 0.1)';
      rect.id = `roi-rectangle-${i}`;
      
      // Convert pixel coordinates back to normalized coordinates for display
      let normalizedX = roi.x, normalizedY = roi.y, normalizedW = roi.width, normalizedH = roi.height;
      if (dziDims) {
        normalizedX = roi.x / dziDims.width;
        normalizedY = roi.y / dziDims.height;
        normalizedW = roi.width / dziDims.width;
        normalizedH = roi.height / dziDims.height;
      } else {
        // For regular images, get the image dimensions from the viewer
        const imgSize = osdViewer.current.world.getItemAt(0).getContentSize();
        normalizedX = roi.x / imgSize.x;
        normalizedY = roi.y / imgSize.y;
        normalizedW = roi.width / imgSize.x;
        normalizedH = roi.height / imgSize.y;
      }
      
      osdViewer.current.addOverlay({
        element: rect,
        location: new OpenSeadragon.Rect(normalizedX, normalizedY, normalizedW, normalizedH),
        id: `roi-rectangle-${i}`,
      });
    });
  }, [rois, osdViewer.current, dziDims]);

  const handleCoordChange = (e) => {
    const { name, value } = e.target;
    setRoiCoords((prev) => ({ ...prev, [name]: value.replace(/[^0-9]/g, '') }));
  };

  const handleProcess = async () => {
    if (!uploadedFile) return;
    setProcessing(true);
    setResultImg(null);
    setError(null);
    try {
      let req = {
        wsi_path: uploadedFile,
        x: parseInt(roiCoords.x, 10),
        y: parseInt(roiCoords.y, 10),
        width: parseInt(roiCoords.width, 10),
        height: parseInt(roiCoords.height, 10),
        threshold_type: thresholdType,
        morph_ops: morphOps,
        morph_kwargs: thresholdType === 'manual' ? { manual_value: manualValue } : {},
      };
      if (dziUrl && dziDims) {
        // Optionally, validate bounds here
      }
      // Validate manual ROI entry if used
      if (roiCoords.x && roiCoords.y && roiCoords.width && roiCoords.height) {
        const x = parseInt(roiCoords.x, 10);
        const y = parseInt(roiCoords.y, 10);
        const width = parseInt(roiCoords.width, 10);
        const height = parseInt(roiCoords.height, 10);
        if (width > 0 && height > 0) {
          const roi = { x, y, width, height };
          console.log('Adding manual ROI:', roi);
          setRois(prev => [...prev, roi]);
        } else {
          alert('ROI width and height must be greater than 0.');
          return;
        }
      }
      const response = await axios.post('http://172.21.174.100:8000/process_roi', req);
      setResultImg('data:image/png;base64,' + response.data.image);
    } catch (err) {
      setError('Processing failed.');
    } finally {
      setProcessing(false);
    }
  };

  const handleRemoveRoi = (idx) => {
    setRois(prev => prev.filter((_, i) => i !== idx));
  };

  // Process all ROIs
  const handleProcessAll = async () => {
    if (!uploadedFile || rois.length === 0) return;
    setProcessing(true);
    setResultImg(null);
    setError(null);
    try {
      const req = {
        wsi_path: uploadedFile,
        rois: rois.map(r => ({
          x: Math.round(r.x),
          y: Math.round(r.y),
          width: Math.round(r.width),
          height: Math.round(r.height)
        })),
        threshold_type: thresholdType,
        morph_ops: morphOps,
        morph_kwargs: thresholdType === 'manual' ? { manual_value: manualValue } : {},
      };
      const response = await axios.post('http://172.21.174.100:8000/process_roi', req);
      setSegResults(response.data.results);
      setRoiLabels(Array(rois.length).fill(0));
    } catch (err) {
      setError('Processing failed.');
    } finally {
      setProcessing(false);
    }
  };

  // Handle label change
  const handleLabelChange = (idx, value) => {
    setRoiLabels(prev => prev.map((l, i) => i === idx ? value : l));
  };

  // Train model
  const handleTrainModel = async () => {
    try {
      const rgb = segResults.map(r => r.rgb);
      const labels = roiLabels.map(l => parseInt(l, 10));
      const response = await axios.post('http://172.21.174.100:8000/train_model', { rgb, labels });
      setModelId(response.data.model_id);
      setLossHistory(response.data.loss_history || []);
    } catch (err) {
      setError('Training failed.');
    }
  };

  // Predict on a selected ROI
  const handlePredict = async (idx) => {
    try {
      const rgb = segResults[idx].rgb;
      const response = await axios.post('http://172.21.174.100:8000/predict_model', { model_id: modelId, rgb });
      setPredictions(prev => {
        const newPreds = [...prev];
        newPreds[idx] = response.data.predictions;
        return newPreds;
      });
    } catch (err) {
      setError('Prediction failed.');
    }
  };

  return (
    <Box sx={{ p: 4 }}>
      <Typography variant="h4" gutterBottom>
        WSI ROI Processing Platform
      </Typography>
      <Box sx={{ mb: 2 }}>
        <input
          type="file"
          accept=".svs,.tiff,.tif,.ndpi,.mrxs,.vms,.vmu,.scn,.svslide,.bif,.jpg,.png"
          onChange={handleFileChange}
          style={{ display: 'none' }}
          id="wsi-upload-input"
        />
        <label htmlFor="wsi-upload-input">
          <Button variant="contained" component="span">
            Choose WSI File
          </Button>
        </label>
        {selectedFile && (
          <Typography variant="body1" sx={{ ml: 2, display: 'inline' }}>
            {selectedFile.name}
          </Typography>
        )}
      </Box>
      <Button
        variant="contained"
        color="primary"
        onClick={handleUpload}
        disabled={!selectedFile || uploading}
      >
        {uploading ? <CircularProgress size={24} /> : 'Upload'}
      </Button>
      {uploading && (
        <Box sx={{ width: 300, mt: 2 }}>
          <Typography variant="body2">Uploading: {uploadProgress}%</Typography>
          <LinearProgress variant="determinate" value={uploadProgress} />
        </Box>
      )}
      {uploadedFile && (
        <Typography variant="body2" color="success.main" sx={{ mt: 2 }}>
          Uploaded: {uploadedFile}
        </Typography>
      )}
      {((dziUrl || (uploadedFile && (uploadedFile.endsWith('.jpg') || uploadedFile.endsWith('.png'))))) && (
        <Box sx={{ mt: 4 }}>
          <Typography variant="h6">WSI Viewer</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 1, gap: 2 }}>
            <Tooltip title={drawMode ? "Pan/Zoom Mode" : "Draw ROI Mode"}>
              <IconButton onClick={() => setDrawMode(m => !m)} color={drawMode ? 'primary' : 'default'}>
                <CropSquareIcon />
              </IconButton>
            </Tooltip>
            <Typography variant="body2">{drawMode ? 'Draw ROI: Drag to select rectangles' : 'Pan/Zoom: Click to enable ROI drawing'}</Typography>
          </Box>
          <div ref={viewerRef} style={{ width: '800px', height: '600px', border: '1px solid #ccc' }} />
          <Box sx={{ mt: 2, mb: 2 }}>
            <Typography variant="subtitle1">Selected ROIs:</Typography>
            {rois.length === 0 && <Typography variant="body2">No ROIs selected.</Typography>}
            {rois.map((roi, idx) => (
              <Box key={idx} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Typography variant="body2">
                  ROI {idx + 1}: x={Math.round(roi.x)}, y={Math.round(roi.y)}, w={Math.round(roi.width)}, h={Math.round(roi.height)}
                </Typography>
                <IconButton size="small" color="error" onClick={() => handleRemoveRoi(idx)}><DeleteIcon fontSize="small" /></IconButton>
              </Box>
            ))}
          </Box>
          <Box sx={{ mt: 2, display: 'flex', gap: 2, alignItems: 'center' }}>
            <TextField
              label="X"
              name="x"
              value={roiCoords.x}
              onChange={handleCoordChange}
              size="small"
              sx={{ width: 100 }}
            />
            <TextField
              label="Y"
              name="y"
              value={roiCoords.y}
              onChange={handleCoordChange}
              size="small"
              sx={{ width: 100 }}
            />
            <TextField
              label="Width"
              name="width"
              value={roiCoords.width}
              onChange={handleCoordChange}
              size="small"
              sx={{ width: 100 }}
            />
            <TextField
              label="Height"
              name="height"
              value={roiCoords.height}
              onChange={handleCoordChange}
              size="small"
              sx={{ width: 100 }}
            />
            <FormControl sx={{ minWidth: 160 }}>
              <InputLabel>Threshold</InputLabel>
              <Select
                value={thresholdType}
                onChange={e => setThresholdType(e.target.value)}
                input={<OutlinedInput label="Threshold" />}
              >
                <MenuItem value="otsu">Otsu</MenuItem>
                <MenuItem value="adaptive">Adaptive</MenuItem>
                <MenuItem value="manual">Manual</MenuItem>
              </Select>
            </FormControl>
            {thresholdType === 'manual' && (
              <FormControl sx={{ minWidth: 120 }}>
                <InputLabel>Manual Value</InputLabel>
                <OutlinedInput
                  type="number"
                  value={manualValue}
                  onChange={e => setManualValue(Number(e.target.value))}
                  label="Manual Value"
                />
              </FormControl>
            )}
            <FormControl sx={{ minWidth: 200 }}>
              <InputLabel>Morphology</InputLabel>
              <Select
                multiple
                value={morphOps}
                onChange={e => setMorphOps(e.target.value)}
                input={<OutlinedInput label="Morphology" />}
                renderValue={selected => selected.join(', ')}
              >
                {['erosion', 'dilation', 'opening', 'closing'].map(op => (
                  <MenuItem key={op} value={op}>
                    <Checkbox checked={morphOps.indexOf(op) > -1} />
                    <ListItemText primary={op} />
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button
              variant="contained"
              color="secondary"
              disabled={
                !roiCoords.x || !roiCoords.y || !roiCoords.width || !roiCoords.height ||
                parseInt(roiCoords.width, 10) <= 0 || parseInt(roiCoords.height, 10) <= 0 || processing
              }
              onClick={handleProcess}
            >
              {processing ? <CircularProgress size={24} /> : 'Process ROI'}
            </Button>
          </Box>
          {resultImg && (
            <Box sx={{ mt: 4 }}>
              <Typography variant="h6">Processed ROI</Typography>
              <img src={resultImg} alt="Processed ROI" style={{ maxWidth: '100%', border: '1px solid #888' }} />
            </Box>
          )}
          <Button
            variant="contained"
            color="secondary"
            sx={{ mt: 2, mb: 2 }}
            disabled={rois.length === 0 || processing}
            onClick={handleProcessAll}
          >
            {processing ? <CircularProgress size={24} /> : 'Process All ROIs'}
          </Button>
          {segResults.length > 0 && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="h6">Segmented ROIs</Typography>
              {segResults.map((res, idx) => (
                <Box key={idx} sx={{ mb: 2, p: 2, border: '1px solid #ccc', borderRadius: 2, background: '#fff' }}>
                  <Typography variant="subtitle2">ROI {idx + 1}</Typography>
                  <img src={`data:image/png;base64,${res.mask}`} alt={`ROI ${idx + 1} mask`} style={{ maxWidth: 200, border: '1px solid #888' }} />
                  <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <TextField
                      label="Label"
                      value={roiLabels[idx] || ''}
                      onChange={e => handleLabelChange(idx, e.target.value)}
                      size="small"
                      sx={{ width: 80 }}
                    />
                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => {
                        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(res.rgb));
                        const dlAnchor = document.createElement('a');
                        dlAnchor.setAttribute("href", dataStr);
                        dlAnchor.setAttribute("download", `roi_${idx + 1}_rgb.json`);
                        dlAnchor.click();
                      }}
                    >
                      Download RGB
                    </Button>
                    {modelId && (
                      <Button
                        variant="contained"
                        size="small"
                        color="primary"
                        onClick={() => handlePredict(idx)}
                      >
                        Predict
                      </Button>
                    )}
                  </Box>
                  {predictions[idx] && (
                    <Typography variant="body2" color="secondary">
                      Prediction: {JSON.stringify(predictions[idx])}
                    </Typography>
                  )}
                </Box>
              ))}
              <Button
                variant="contained"
                color="success"
                sx={{ mt: 2 }}
                disabled={segResults.length === 0 || roiLabels.some(l => l === '' || isNaN(Number(l)))}
                onClick={handleTrainModel}
              >
                Train Model
              </Button>
              {modelId && (
                <>
                  <Typography variant="body2" color="success.main" sx={{ mt: 2 }}>
                    Model trained! Model ID: {modelId}
                  </Typography>
                  {lossHistory.length > 0 && (
                    <Box sx={{ mt: 2 }}>
                      <Typography variant="subtitle2">Training Loss Curve</Typography>
                      <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={lossHistory.map((loss, i) => ({ epoch: i + 1, loss }))}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="epoch" label={{ value: 'Epoch', position: 'insideBottomRight', offset: 0 }} />
                          <YAxis label={{ value: 'Log Loss', angle: -90, position: 'insideLeft' }} />
                          <ChartTooltip />
                          <Line type="monotone" dataKey="loss" stroke="#1976d2" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </Box>
                  )}
                </>
              )}
            </Box>
          )}
        </Box>
      )}
      {error && (
        <Typography variant="body2" color="error" sx={{ mt: 2 }}>
          {error}
        </Typography>
      )}
    </Box>
  );
}

export default App;
