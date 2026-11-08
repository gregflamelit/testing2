"""Reproduce the frozen, browser-deployable wine-quality model. No API keys required."""
import csv
import hashlib
import json
from pathlib import Path
import numpy as np
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import GroupShuffleSplit
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.inspection import permutation_importance

ROOT = Path(__file__).resolve().parent
SEED = 42

def predict_tree(tree, x):
    node = 0
    while tree['left'][node] != -1:
        node = tree['left'][node] if float(np.float32(x[tree['feature'][node]])) <= tree['threshold'][node] else tree['right'][node]
    return tree['value'][node]

def predict(model, x):
    return float(np.mean([predict_tree(t, x) for t in model['trees']]))

def main():
    source = ROOT / 'data' / 'winequality-red.csv'
    with source.open(newline='') as f:
        reader = csv.reader(f)
        names = next(reader)
        data = np.array(list(reader), dtype=float)
    assert names[-1] == 'quality' and len(names) == 12
    x, y = data[:, :-1], data[:, -1]
    assert np.isfinite(data).all()
    # Exact duplicate chemistry profiles stay together, including conflicting labels.
    _, groups = np.unique(x, axis=0, return_inverse=True)
    train_cal, test = next(GroupShuffleSplit(n_splits=1, test_size=.2, random_state=SEED).split(x, y, groups))
    tr, ca = next(GroupShuffleSplit(n_splits=1, test_size=.125, random_state=SEED + 1).split(x[train_cal], y[train_cal], groups[train_cal]))
    train, cal = train_cal[tr], train_cal[ca]
    assert not (set(groups[train]) & set(groups[test]) or set(groups[cal]) & set(groups[test]) or set(groups[train]) & set(groups[cal]))
    # Hyperparameters fixed before seeing the held-out test scores. No preprocessing.
    model = RandomForestRegressor(n_estimators=96, max_depth=10, min_samples_leaf=3, max_features=.8, random_state=SEED, n_jobs=1)
    model.fit(x[train], y[train])
    cp = model.predict(x[cal])
    errors = np.abs(cp - y[cal])
    level = min(1., np.ceil((len(cal)+1)*.9)/len(cal))
    radius = float(np.quantile(errors, level, method='higher'))
    yp = model.predict(x[test])
    baseline_value = float(np.median(y[train]))
    baseline = np.full(len(test), baseline_value)
    importance = permutation_importance(model, x[test], y[test], scoring='neg_mean_absolute_error', n_repeats=8, random_state=SEED)
    metrics = {
        'mae': float(mean_absolute_error(y[test], yp)),
        'baselineMae': float(mean_absolute_error(y[test], baseline)),
        'baselineValue': baseline_value,
        'rmse': float(mean_squared_error(y[test], yp)**.5),
        'r2': float(r2_score(y[test], yp)),
        'withinOne': float(np.mean(np.abs(yp-y[test]) <= 1)),
        'intervalCoverage': float(np.mean(np.abs(yp-y[test]) <= radius)),
        'intervalRadius': radius,
        'intervalNominal': .9,
        'trainCount': len(train), 'calibrationCount': len(cal), 'testCount': len(test),
        'uniqueProfiles': len(np.unique(groups)), 'seed': SEED,
        'permutationImportance': importance.importances_mean.tolist(),
        'permutationStd': importance.importances_std.tolist(),
        'errorByQuality': [{'quality': int(q), 'count': int(np.sum(y[test]==q)), 'mae': float(np.mean(np.abs(yp[y[test]==q]-q)))} for q in np.unique(y[test])],
    }
    trees = []
    for estimator in model.estimators_:
        t = estimator.tree_
        trees.append({'left': t.children_left.tolist(), 'right': t.children_right.tolist(), 'feature': t.feature.tolist(), 'threshold': t.threshold.tolist(), 'value': t.value[:, 0, 0].tolist()})
    artifact = {'version': 1, 'features': names[:-1], 'trees': trees, 'metrics': metrics,
        'minimum': x.min(axis=0).tolist(), 'maximum': x.max(axis=0).tolist(),
        'median': np.median(x[train], axis=0).tolist(), 'std': x[train].std(axis=0).tolist(),
        'q05': np.quantile(x[train], .05, axis=0).tolist(), 'q95': np.quantile(x[train], .95, axis=0).tolist(),
        'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        'testVectors': [{'x': row.tolist(), 'prediction': float(p)} for row, p in zip(x[test[:8]], yp[:8])]}
    # Validate the actual JSON inference representation against sklearn.
    assert np.max(np.abs(np.array([predict(artifact, row) for row in x[test]]) - yp)) < 1e-10
    (ROOT / 'web' / 'model.json').write_text(json.dumps(artifact, separators=(',', ':'), allow_nan=False))
    testset = set(test.tolist())
    (ROOT / 'web' / 'dataset.json').write_text(json.dumps({'columns': names, 'rows': data.tolist(), 'split': ['test' if i in testset else 'calibration' if i in set(cal.tolist()) else 'train' for i in range(len(x))], 'testPredictions': [{'index': int(i), 'actual': float(y[i]), 'prediction': float(p)} for i, p in zip(test, yp)]}, separators=(',', ':')))
    (ROOT / 'metrics.json').write_text(json.dumps(metrics, indent=2))
    print(json.dumps(metrics, indent=2))

if __name__ == '__main__':
    main()
