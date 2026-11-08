# Cuvée Lab

**Wine, understood.** A red wine quality workbench for deciding which batches deserve a closer sensory review.

**Live app:** https://gregflamelit.github.io/testing2/

## Try it

1. Start with the training median or a real dataset profile.
2. Adjust any of eleven lab measurements. The browser evaluates a real 96-tree random forest immediately.
3. Read the predicted sensory score and split-conformal prediction interval.
4. Explore local model sensitivity, save up to four wines to a tasting flight, and export the forecast as JSON.
5. Visit **The vineyard** to explore sample chemistry and observed scores. **Behind the model** explains validation, feature importance, and errors at rare scores.

There is no cloud inference, API key, generative text, authentication, or server-side database. The small dataset and trained model are downloaded once; subsequent calculations happen on the device. Saved tasting flights stay in browser localStorage.

## Run locally

Node.js 20 or later, no npm dependencies:

```sh
npm start
```

Open http://127.0.0.1:8872. `PORT=9000 npm start` selects another port on POSIX shells; PowerShell: `$env:PORT=9000; npm start`.

Alternatively, `python -m http.server 8872 --directory web`. Serve over HTTP; opening index.html as a file blocks JSON loading in most browsers.

## Reproduce training

Python 3.12 is the reference environment. The committed model is ready to use without Python.

```sh
python -m venv .venv
# Activate the virtual environment for your shell.
python -m pip install -r requirements.txt
python train.py
npm test
```

Training reads `data/winequality-red.csv` and regenerates `web/model.json`, `web/dataset.json`, and `metrics.json`. The model JSON contains tree arrays, training-only descriptive reference values, dataset SHA-256, and sklearn prediction test vectors. `web/inference.mjs` implements tree traversal and casts measurements to float32 to match sklearn's inference. Exact serialized bytes can vary across dependency versions/platforms; use the pinned dependencies and tests for functional equivalence.

## Validation

Seed **42**. Exact duplicate eleven-feature chemistry profiles are grouped before splitting, irrespective of their labels. GroupShuffleSplit creates an approximately 20% test partition, then seed **43** reserves 12.5% of the remaining groups for calibration (approximately 70/10/20 overall). Result: **1,112 training / 158 calibration / 329 test rows**; **1,359 unique profiles**. Duplicate groups never cross partitions. Group sizes mean row proportions are approximate.

No imputation or scaling is needed: all supplied features are finite numeric values. The quality target is sliced out before fitting. A fixed RandomForestRegressor uses 96 trees, depth 10, minimum leaf size 3, max_features 0.8, n_jobs 1. Hyperparameters are fixed, not tuned on the test partition. The final deployed model remains training-only; it is not refitted on test/calibration rows.

| Held-out metric | Result |
| --- | ---: |
| Model MAE | 0.496804 |
| Training-median baseline MAE (constant 6) | 0.610942 |
| Relative MAE reduction | 18.68% |
| RMSE | 0.630113 |
| R² | 0.350792 |
| Predictions within one quality point | 89.36% |
| 90% nominal interval coverage | 92.71% |

The interval radius (1.145226 points) is the finite-sample corrected 90th percentile of absolute calibration errors, using the higher quantile. Intervals are clipped to the known 0–10 score scale. Coverage is an empirical test result, not a guarantee for an arbitrary input. Grouped duplicates make the row-weighted calibration sample less straightforward than independent observations; the nominal level is a useful approximation, not a proof of population coverage. A single split has uncertainty; no claim of broad generalization is made.

Test permutation importance uses MAE degradation over 8 shuffles (seed 42). It is diagnostic only, not feature selection; negatively valued importance estimates are shown honestly. The full-data scatter plot describes associations, not out-of-sample performance. Sensitivity perturbs alcohol by 0.5% vol, volatile acidity/sulphates by 0.05 g/L while holding everything else fixed; hypothetical combinations need not be physically attainable.

## Limitations

- Recorded quality is subjective and ordinal; regression treats it as approximately continuous.
- The observed labels span 3–8, with most scores at 5–6. The test set has just two score-3 samples and two score-8 samples; their MAEs are 2.321 and 1.511. Rare extremes are poorly estimated.
- Red Vinho Verde chemistry does not establish performance on other regions, vintages, or wine styles. Do not infer health, safety, price, or regulatory suitability.
- Individual feature bounds and central-90% warnings do not detect every unusual combination or distribution shift.
- No adjustment proves causality or guarantees an improvement in a real wine. Use tasting and lab review.
- There is no independent winery/time/site holdout because that metadata is absent.

## Tests and deployment

`npm test` checks all 329 exported test predictions against sklearn, recomputes MAE/baseline/interval coverage, verifies duplicate-group isolation and partition counts, and rejects invalid inference inputs. The trainer also validates the exported representation against sklearn for every test row.

GitHub Actions verifies the committed artifact and deploys `web/` to GitHub Pages on `main`. Enable Settings → Pages → Source: GitHub Actions if forking. No build step or third-party runtime requests are needed. Preserve `talent-source-verification.txt` from the original repository.

## Source and tools disclosure

Created through user prompts with OpenAI Codex. UI, SVG glass illustration, JavaScript inference, training script, and tests were authored for this project; no UI template, stock images, or external fonts were used. Model implementation: scikit-learn; numerical computing: NumPy. Hosted with GitHub Pages/Actions. These libraries and GitHub Actions are external dependencies, not custom implementations.

Dataset: user-supplied 1,599-row red wine CSV, originating from **UCI Wine Quality**, P. Cortez, A. Cerdeira, F. Almeida, T. Matos and J. Reis (2009), *Modeling wine preferences by data mining from physicochemical properties*, Decision Support Systems 47(4):547–553. Dataset DOI: https://doi.org/10.24432/C56S3T. Dataset distributed under CC BY 4.0 per UCI; original attribution retained here.

The supplied PDF lists an official cutoff of November 7, 2026, 12:20:33 PM EST. This build was performed November 8, 2026 at the user's request. No claim of eligibility, speed points, official timing, or challenge submission is made. The user explicitly selected `gregflamelit/testing2`, overriding the older repository link in the PDF. No registration or attempt state was changed.
