# Submission evidence and remaining checks

## 1. Real SPHEREx investigation

Target: Barnard's Star field, ICRS RA 269.4521°, Dec +4.6934°, 5 arcmin.
Open `/explorer?ra=269.4521&dec=4.6934&source=spherex&mode=side-by-side`.

The live IRSA discovery query returned these detector-3 observations:

| Input | UTC start | Observation ID | Detector range |
| --- | --- | --- | --- |
| A | 2025-08-15 20:45:11.376 | 2025W33_2C_0321_1 | 1.6301–2.4346 µm |
| B | 2026-05-05 01:59:28.781 | 2026W19_1A_0403_1 | 1.6301–2.4346 µm |

Archive preview requests returned MJy/sr images with 15,483 and 15,771 finite pixels respectively on the 128×128 grid, before the latest quality-mask change. A fresh native-pixel request subsequently returned HTTP 503. These counts do not establish quality or wavelength compatibility. Recheck both exposures in the latest deployment before demonstrating subtraction.

Conclusion: two real dated images are available for visual study. Differences may arise from wavelength response, background, processing, PSF or missing coverage. No motion or planetary discovery is established. Do not describe this as a verified moving-object detection.

## 2. Comparison safeguards

Preview quality flags and invalid variances are masked. Both images use the same TAN sky grid. Missing interpolation support remains empty. Frontend and PSF API reject unavailable quality/spectral lookup, insufficient shared coverage, differing detectors and mismatched pixel bandpasses.

The visualization gate requires wavelength centers and bandwidths to agree within 10% of the smaller bandwidth at every valid overlapping grid pixel, with at least 64 overlapping pixels. This is a conservative implementation check, not a scientifically validated variability threshold. WCS-WAVE is a visualization lookup; rigorous analysis requires calibration products, uncertainty propagation, background/source separation and validated PSF treatment. A passing gate does not prove motion.

## 3–4. Inputs and conclusions

Explore shows Image A/B dates, bands or detector ranges and releases. “Record a conclusion” collects observations and alternative explanations. Save retains these notes with actual displayed source URLs, dates, bands and processing metadata. The journal exposes input sources and exports the saved record. Saved records contain metadata, not permanent image files.

## 5. Beginner study — pending real responses

Run individually with five beginners; do not coach their first attempt. No results have been collected or invented.

Ask each participant to select SPHEREx, identify the two input dates, use Blink and Difference when allowed, explain one apparent change, identify whether the spectrum is measured or simulated, and save a tentative conclusion with an alternative explanation.

For P1–P5, record: task completion without help; image source correctly identified; spectrum simulation correctly identified; residual interpreted cautiously; successful save; confusing wording; one suggested improvement. Obtain participant consent and avoid collecting names or personal information. Fix repeated misunderstandings, then retest the affected tasks. Automated tests do not replace this study.

## 6. Publication

The supplied Cloudflare URL returned HTTP 200 and a healthy `/api/health`. Its JavaScript asset was `index-BuRco3EA.js`, an older build than the local implementation. The Cloudflare origin process is not present in this workspace. Publishing to GitHub alone does not update an independently running tunnel origin. Verify the current deployed asset and repeat the investigation after the hosting origin is updated. A trycloudflare URL is temporary and depends on its origin process remaining available.
