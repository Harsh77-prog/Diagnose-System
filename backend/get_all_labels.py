from medmnist import INFO
import json

datasets = ['chestmnist', 'dermamnist', 'retinamnist', 'pathmnist', 'bloodmnist']
all_labels = {}

for d in datasets:
    all_labels[d] = INFO[d]['label']

print(json.dumps(all_labels, indent=2))
