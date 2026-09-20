# Photos

The site loads photos from this folder by file name. To swap a photo, overwrite the file and keep the same name. No code changes needed.

| File name | Where it appears |
| --- | --- |
| `hero.jpg` | Big photo at the top of the home page (single-story home, warm white) |
| `gallery-1.jpg` | Gallery: two-story home in teal |
| `gallery-2.jpg` | Gallery: covered patio, warm white |
| `gallery-3.jpg` | Gallery: daytime eave corner showing the track |
| `gallery-4.jpg` | Gallery: track close-up |

Tips:

- Use `.jpg` files around 1200 to 1600 px wide and under about 500 KB. Most of the current photos are small (about 640 px wide), so they look a little soft on large screens. Replacing them with the full-size originals from your phone will sharpen them up.
- Photos are cropped to a 4:3 shape on the site (square on phones), so keep the house centered.
- To add a fifth photo, copy one of the `<figure class="gallery-item">` blocks in `index.html` and point it at the new file.
