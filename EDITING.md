# Editing Lagos in Layers

Everything below can be edited straight on GitHub: open the file, click the pencil icon, change the text, click **Commit changes**. Vercel republishes the site about a minute later.

Keep the quotation marks, commas and brackets exactly as they are; change only the text between the quotes.

## Period names, year labels and colours — `data/periods.json`

```json
{
  "label": "2011–2015",
  "name": "Lekki Corridor / Eko Atlantic",
  "color": "#3f8f6b",
  "buildings": 88656
}
```

- `label`: the years shown in the legend and on building cards.
- `name`: the title of the period.
- `color`: any hex colour, e.g. `#3f8f6b`.
- `buildings`: the number shown in the legend.

Changing `label` or `buildings` changes the **text only**. Which buildings fall in each period, and the timeline, were computed by the data pipeline. To move the actual period boundaries or totals, rerun `pipeline/build2.py` with new values in its `QUOTA` and `PBOUND` lists.

## Layer names, eras, descriptions and stories — `data/layers.json`

Each layer has `name`, `era` and `intro`. Story layers also have `items`, each with `name`, `year`, `text`, `source` and `url`. Edit any of these texts freely. Theme headings are in `cats` at the top of the file.

## Quest questions — `data/quests.json`

Each round has a `title`, a `blurb` and a list `qs`. Each clue has:
- `q`: the question;
- `a`: the answers to accept (lower case; add common spellings);
- `t`: the story place the map flies to (must match a story `name` in `data/layers.json`);
- `hint`: the first hint (the second hint, the letter pattern, is made automatically).

## Title, subtitle and About page — `index.html`

- The big title: search for `class="wordmark"`.
- The line under it: search for `class="dek"`.
- The About page: everything between `<dialog id="about"` and the next `</dialog>`.

## Colours and fonts — `styles.css`

The first lines (`:root { … }`) hold the colours: `--accent` is the danfo yellow, `--haze` the background, `--rail` the width of the left panel.

## Checking a change before it goes live

Download the repository, open a terminal in its folder and run `python3 -m http.server 8000`, then open `http://localhost:8000`.
