# Where the geography data comes from

- **Borders, names, neighbours:** Natural Earth, 1:50m "Admin 0 - Countries" (naturalearthdata.com). Public domain.
  Changes made here: borders simplified, far-away overseas parts left out, Crimea drawn with Ukraine,
  Somaliland with Somalia and Northern Cyprus with Cyprus. Countries are the 193 UN members plus
  Vatican City, Palestine, Kosovo and Taiwan.
- **Flags:** flag-icons by Panayiotis Lipiridis (github.com/lipis/flag-icons). MIT License, copyright (c) 2013 Panayiotis Lipiridis.

Rebuild with `node tools/build-geo.js <countries.geojson> <flag-icons/flags/4x3>`.
