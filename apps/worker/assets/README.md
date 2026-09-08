# Synthetic inspection probes

These tiny, generated 32 × 24 fixtures contain no external content or personal data.
The worker exercises its actual storage, image decoder and sandboxed video inspector
before reporting ready and once per minute thereafter. Probe outputs are removed.

`inspection-probe.png` was generated with Sharp 0.35.4 using a three-channel solid
`#ece5f7` image. `inspection-probe.mp4` was generated with FFmpeg 9.0.1 using:

```sh
ffmpeg -v error -n -f lavfi -i color=c=0xece5f7:s=32x24:r=10:d=0.4 \
  -c:v libx264 -profile:v baseline -level:v 3.0 -threads 1 -pix_fmt yuv420p \
  -map_metadata -1 -movflags +faststart -f mp4 inspection-probe.mp4
```

The fixtures are operational test inputs, not public presentation assets.
