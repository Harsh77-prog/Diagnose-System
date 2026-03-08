import os
os.environ.pop('MODEL_DIR', None)
from backend.routers.diagnose import _get_image_predictor
print('model_dir used =', _get_image_predictor().model_dir)
