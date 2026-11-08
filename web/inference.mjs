export function predict(model, values) {
  if (values.length !== 11 || values.some(v => !Number.isFinite(v))) throw new Error('Provide eleven finite numeric measurements.');
  const x = values.map(Math.fround);
  let sum = 0;
  for (const tree of model.trees) {
    let n = 0;
    while (tree.left[n] !== -1) n = x[tree.feature[n]] <= tree.threshold[n] ? tree.left[n] : tree.right[n];
    sum += tree.value[n];
  }
  return sum / model.trees.length;
}
export function interval(model, score) {
  return [Math.max(0, score - model.metrics.intervalRadius), Math.min(10, score + model.metrics.intervalRadius)];
}
