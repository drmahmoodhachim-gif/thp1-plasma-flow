# E1 THP-1 + mouse plasma — live flow explorer

Interactive re-gating of the 7 September 2026 Fortessa tubes. Move the dye cut-off, singlet band and cell-size gate; every figure updates from the raw events.

- **Live app:** https://thp1-plasma-flow.netlify.app
- **How the codes work (easy guide, with links):** https://thp1-plasma-flow.netlify.app/codes.html
- **GitHub:** https://github.com/drmahmoodhachim-gif/thp1-plasma-flow
- **Methods write-up:** [METHODS.md](https://github.com/drmahmoodhachim-gif/thp1-plasma-flow/blob/main/METHODS.md)

---

## Run the analysis (figures + tables)

```bash
pip install -r flow_analysis/requirements.txt
cd flow_analysis
python run_all.py --data "../Flow Files" --out ../output --skip-overview
```

[`run_all.py`](https://github.com/drmahmoodhachim-gif/thp1-plasma-flow/blob/main/flow_analysis/run_all.py) calls the other Python scripts in order.

Then pack the events for the website:

```bash
python flow_analysis/export_web_data.py --data "Flow Files" --out site/data
python -m http.server 8766 --directory site
```

Open http://127.0.0.1:8766/

---

## Scripts, in the order you would use them

| Step | File | What it does |
|---|---|---|
| Settings | [config.py](https://github.com/drmahmoodhachim-gif/thp1-plasma-flow/blob/main/flow_analysis/config.py) | File names, FlowJo polygons, recommended gates, dye cut-off, colours. Edit gates here. |
| Style | [plotstyle.py](https://github.com/drmahmoodhachim-gif/thp1-plasma-flow/blob/main/flow_analysis/plotstyle.py) | Shared PNG look (300 dpi). |
| Read data | [flowdata.py](https://github.com/drmahmoodhachim-gif/thp1-plasma-flow/blob/main/flow_analysis/flowdata.py) | Opens `.fcs` files, applies gates, logicle scale, confidence intervals. |
| Check FlowJo | [parse_workspace.py](https://github.com/drmahmoodhachim-gif/thp1-plasma-flow/blob/main/flow_analysis/parse_workspace.py) | Reads the `.wsp` and checks Python counts vs FlowJo. |
| Run all | [run_all.py](https://github.com/drmahmoodhachim-gif/thp1-plasma-flow/blob/main/flow_analysis/run_all.py) | One command for the full analysis. |
| Fig S0 | [figures_overview.py](https://github.com/drmahmoodhachim-gif/thp1-plasma-flow/blob/main/flow_analysis/figures_overview.py) | Exploratory grids (slow). |
| Figs 1–5 | [figures_part1.py](https://github.com/drmahmoodhachim-gif/thp1-plasma-flow/blob/main/flow_analysis/figures_part1.py) | Original gating and why it over-estimates viability. |
| Figs 6–9, S1 | [figures_part2.py](https://github.com/drmahmoodhachim-gif/thp1-plasma-flow/blob/main/flow_analysis/figures_part2.py) | Recommended gating, dose–response, composition, granularity. |
| Figs 10–16 + 3D | [figures_fancy.py](https://github.com/drmahmoodhachim-gif/thp1-plasma-flow/blob/main/flow_analysis/figures_fancy.py) | Presentation figures and the original 3D HTML explorer. |
| Tables | [tables.py](https://github.com/drmahmoodhachim-gif/thp1-plasma-flow/blob/main/flow_analysis/tables.py) | Four CSV tables. |
| PowerPoint | [extras/make_deck.js](https://github.com/drmahmoodhachim-gif/thp1-plasma-flow/blob/main/flow_analysis/extras/make_deck.js) | Optional deck rebuild (Node.js). |
| Website data | [export_web_data.py](https://github.com/drmahmoodhachim-gif/thp1-plasma-flow/blob/main/flow_analysis/export_web_data.py) | Packs events for the browser. |
| Live page | [site/index.html](https://github.com/drmahmoodhachim-gif/thp1-plasma-flow/blob/main/site/index.html) · [app.js](https://github.com/drmahmoodhachim-gif/thp1-plasma-flow/blob/main/site/app.js) · [styles.css](https://github.com/drmahmoodhachim-gif/thp1-plasma-flow/blob/main/site/styles.css) · [config.js](https://github.com/drmahmoodhachim-gif/thp1-plasma-flow/blob/main/site/config.js) | Interactive gates and figures. |
| Hosting | [netlify.toml](https://github.com/drmahmoodhachim-gif/thp1-plasma-flow/blob/main/netlify.toml) | Publishes the `site/` folder. |

Packages: [requirements.txt](https://github.com/drmahmoodhachim-gif/thp1-plasma-flow/blob/main/flow_analysis/requirements.txt) (numpy, scipy, matplotlib, flowio, flowutils).

Saved gate presets use the Supabase table `e1_flow_gate_presets`.
