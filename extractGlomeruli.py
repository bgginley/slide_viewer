import openslide
import json
import numpy
import glob
from tqdm import tqdm
import os
import cv2
from skimage.io import imsave
svs_path='/orange/pinaki.sarder/Davy_Jones_Locker/LN_R01_Data/svs/'
json_path='/home/br.ginley/LN_json/'


for slide_path in glob.glob(svs_path+'*.svs'):
    slide=openslide.OpenSlide(slide_path)
    seg_data=json.load(open(f"{json_path}{slide_path.split('/')[-1].split('.svs')}.json"))
    for annot in seg_data:
        if annot['name']=='glomerulus':
            save_annot=annotation

    for elem in save_annot:
        pts=np.array(elem['points'])[:,:2].astype('int32')
        xMin=np.min(pts[:,0])
        xMax=np.max(pts[:,0])
        yMin=np.min(pts[:,1])
        yMax=np.max(pts[:,1])
        reg=np.array(slide.read_region((xMin,yMin),0,(xMax-xMin,yMax-yMin)))[:,:,:3]
        mask=np.zeros((yMax-yMin),(xMax-xMin))
        mask=cv2.fillPoly(mask,[[pts]])
        imsave('image.png',reg)
        imsave('mask.png',mask*255)
        break
    break
