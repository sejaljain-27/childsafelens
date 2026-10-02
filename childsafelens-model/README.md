# ChildSafeLens — Cyberbullying Detection (Hinglish + English)

ChildSafeLens is a text classification system for detecting cyberbullying and harmful content
in social media style text, built specifically to handle Hinglish (Hindi-English code-mixed)
text alongside standard English, rather than treating either language in isolation.

## Problem Statement

Most existing cyberbullying detection research and tools are built and evaluated on a single
language, typically English. This leaves a gap for regions where users write in code-mixed
languages such as Hinglish. ChildSafeLens is built to close that gap by training and evaluating
models on a corpus that is majority Hinglish, with English included alongside it, rather than
as an afterthought.

## Dataset

The final training corpus was built by merging three source datasets:

- An English toxic comment dataset
- A Hinglish cyberbullying dataset (approximately 10,000 rows)
- A merged supplementary dataset

After merging, duplicates were removed and each row was automatically tagged as Hinglish or
English using a curated Hindi/Hinglish word list. The final corpus was composed to be
approximately 75 percent Hinglish and 25 percent English, to reflect the intended real-world
use case. Each row is labeled as either bullying/harmful (-1) or non-bullying (0).

## Pipeline

The full pipeline, implemented in `ChildSafeLens_Full_Pipeline.ipynb`, follows these stages:

1. **Data Merging and Cleaning** — Combine the three source files into a single schema
   (`text`, `label`), remove duplicates, and standardize labels.

2. **Exploratory Data Analysis** — Examine corpus size, text length distributions, and class
   balance.

3. **Language Tagging** — Detect and tag each row as Hinglish or English using a curated
   lexicon-based ratio score, and analyze how vocabulary, length, and class balance differ
   between the two language groups.

4. **Text Preprocessing** — Lowercase text, strip emojis, URLs, HTML, mentions, and numbers,
   expand common chat abbreviations (for example "u" to "you", "kyu" to "kyun"), and remove
   punctuation. This cleaned text is the input every downstream model actually uses.

5. **Feature Engineering** — Derive structural and behavioral features from each cleaned text,
   including abusive word counts, fuzzy-matched profanity detection (to catch misspelled slurs),
   punctuation and capitalization ratios, part-of-speech counts, and the Hinglish code-mixing
   ratio.

6. **Train/Test Split** — Split the corpus into training and test sets for model evaluation.

7. **Classical Machine Learning Benchmark** — Evaluate multiple text representations (Bag-of-Words,
   TF-IDF word-level, TF-IDF character-level, Word2Vec CBOW and Skip-gram, FastText) paired with
   Logistic Regression, LinearSVC, and Multinomial Naive Bayes classifiers.

8. **Hyperparameter Tuning** — Grid-search the strongest classical configuration, TF-IDF
   (word and character n-grams) combined with the hand-crafted features and a LinearSVC
   classifier, to arrive at a tuned final classical model.

9. **Error Analysis** — Examine misclassifications from the tuned classical model, broken down
   by false positives and false negatives, and further broken down by Hinglish versus English,
   to identify any language-specific weaknesses.

10. **Deep Learning Benchmark** — Train Simple RNN, LSTM, and Bidirectional LSTM sequence models,
    each learning its own text representation from scratch, without pretrained embeddings.

11. **Final Model Comparison** — Compare every classical and deep learning model side by side on
    accuracy, precision, recall, and macro F1 score.

12. **Production Artifact Export** — Export the best-performing model along with everything
    needed to run it independently for inference.

## Results

| Model | Accuracy | F1 (macro) |
|---|---|---|
| TF-IDF Word+Char+Custom + LinearSVC | 0.9735 | 0.9634 |
| TF-IDF Word+Char+Custom + LinearSVC (tuned) | 0.9716 | 0.9606 |
| TF-IDF Word+Char+Custom + Logistic Regression | 0.9677 | 0.9559 |
| Bag-of-Words + Logistic Regression | 0.9650 | 0.9519 |
| Bi-LSTM | 0.9639 | 0.9507 |
| CNN + Bi-LSTM (hybrid) | 0.9628 | 0.9491 |
| TF-IDF Word+Char + Logistic Regression | 0.9556 | 0.9400 |
| LSTM | 0.8795 | 0.8490 |
| Simple RNN | 0.8004 | 0.7537 |

The full comparison, including additional embedding-based baselines, is available in the
notebook's model comparison table and in `model_comparison_results.csv` after running the
pipeline.

## Final Model

The Bidirectional LSTM was selected as the production model based on macro F1 score among the
deep learning models. It is exported as a Keras model (`best_deep_learning_model.keras`) along
with its tokenizer (`tokenizer.pkl`) and sequence configuration (`sequence_config.json`).

**Deployment note:** the tuned classical LinearSVC pipeline was benchmarked as the strongest
classical configuration and is lightweight enough for real-time, on-device inference. The
Bi-LSTM model is more resource-intensive and is not suited to on-device deployment in its
current form. This is a known tradeoff between the two approaches and should be considered
when deciding how the model is deployed.

## Repository Contents

- `ChildSafeLens_Full_Pipeline.ipynb` — the full pipeline described above, from raw data to
  final model export.
- `Test_Saved_Model_Predictions.ipynb` — loads the exported production model and runs
  predictions on new, unseen text.
- `best_deep_learning_model.keras` — the trained Bi-LSTM model.
- `tokenizer.pkl` — the tokenizer used to convert text into model input sequences.
- `sequence_config.json` — configuration values (sequence length, vocabulary size, label
  mapping) required to run the model correctly.

## Running Inference

1. Run `ChildSafeLens_Full_Pipeline.ipynb` end to end, or use the pre-trained artifacts listed
   above directly.
2. Open `Test_Saved_Model_Predictions.ipynb` and upload the three artifact files when prompted.
3. Use the `classify_deep_learning(text)` function to classify any new sentence, in either
   English or Hinglish, as cyberbullying or non-cyberbullying, along with a probability score.

## Limitations and Future Work

- The deep learning model is trained on this corpus alone, without pretrained multilingual
  embeddings, which limits how well it generalizes to phrasing not well represented in the
  training data.
- Performance can differ across languages depending on how each model type was trained; a
  per-language breakdown is recommended before relying on this model for a specific language
  in production.
- A lightweight, on-device compatible model (the classical LinearSVC pipeline) is available as
  an alternative where real-time or offline inference is required instead of the Bi-LSTM model.
