# E1 THP-1 + mouse plasma — live flow explorer

Interactive re-gating of the 10 September 2026 Fortessa tubes. Drag the dye cut-off, singlet band and all-cells size gate; every figure (3D, scatter, ridgeline, dose–response, donuts, funnel, composition, density) is recalculated in the browser from the packed FCS events.

## Live site

- App: https://thp1-plasma-flow.netlify.app
- Code: https://github.com/drmahmoodhachim-gif/thp1-plasma-flow

Gate presets are stored in Supabase table `e1_flow_gate_presets`.

## Local

```bash
python flow_analysis/export_web_data.py --data "Flow Files" --out site/data
python -m http.server 8766 --directory site
```

Then open http://127.0.0.1:8766/

Python analysis that produced the original figures lives in `flow_analysis/` (see `METHODS.md`).
