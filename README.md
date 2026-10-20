# Park Pressure & Accessibility Explorer: central Weimar

A 3D map of central Weimar that asks three linked questions:

> How far is each place from the nearest park? How many residents live within a 15-minute walk of each park? And which parks might be under more *potential* pressure for their size?

## Why this question

When I walk through Weimar, the green spaces feel very unevenly spread. Some streets are right next to a park, and some blocks have nothing nearby. A park can also be "close" for a lot of people at once. A small green with a dense neighbourhood around it is in a very different situation from a big park on the edge of town. I wanted to see that relationship between distance, population and park size on one map, and to be honest about what the open data can and can't tell me.

## Run it

```
npm install     install the packages (once)
npm run dev     start the app at http://localhost:5173
npm run build   build the site into dist/, the same way GitHub Pages does
```

The site is published by `.github/workflows/deploy.yml` on every push to `main`, at `https://sarasiyanati-ship-it.github.io/Sara-walking-map/`. For that to work, Settings → Pages → Source must be set to "GitHub Actions". `vite.config.js` sets the `/Sara-walking-map/` base path automatically on GitHub, and all data is loaded through `import.meta.env.BASE_URL`.

## The three map layers

Switch between them in the panel on the left. Click a park, or one of the letters A/B/C, to open its details and highlight its 15-minute catchment.

1. **Walking time to the nearest park.** The ground is coloured in 10 m squares: 0–5, 5–10, 10–15, and more than 15 minutes. Grey squares are *not routed*: either water, or no street within 100 m, so I don't invent a time for them. Hover to see the time and which park is nearest.
2. **Park catchments & estimated residents.** The blue areas show how many parks' 15-minute catchments cover a place (1, 2 or 3). Each park label shows the estimated residents in its catchment.
3. **Potential park pressure.** Parks are coloured by estimated residents within a 15-minute walk per hectare of park.

Every number in the panel has a tag: **From data** (taken or measured straight from the files, like plot IDs and park area) or **Modelled estimate** (walking times, catchments, residents, pressure).

## Which parks?

The city kit doesn't have a "park" category and no green space has a name, so I had to decide what counts. The rule is in `src/lib/parks.js`:

- Only plots with land use `recreation` in `plots.geojson`. Squares (`square`) are mostly paved, and cemeteries and water aren't parks, so they're left out.
- Recreation plots less than 10 m apart are joined into one area, because they're often split only by a footpath.
- An area needs at least **0.5 ha** to count as a park. Smaller greens are drawn in pale green but not analysed.
- One 3.50 ha area has 7 buildings tagged `sport` and no footpath through it. It looks like a sports ground rather than a public park, so it's drawn in grey and left out. The data can't confirm this either way.

That leaves three parks, labelled neutrally:

| Park | Plots | Area (from data) | Residents within 15 min (estimate) | Potential pressure (estimate) |
| --- | --- | --- | --- | --- |
| Green area A, along the Ilm | 19 | 7.37 ha | ≈ 7,980 | ≈ 1,080 residents/ha ⚠ |
| Green area B | 3 | 4.42 ha | ≈ 13,170 | ≈ 2,980 residents/ha |
| Green area C | 1 | 0.79 ha | ≈ 6,790 | ≈ 8,600 residents/ha |

⚠ **Green area A is likely underestimated due to incomplete boundary coverage.** It stops about 30 m from the edge of the study area, at the river, and the data can't show whether it continues beyond (in reality Park an der Ilm does). Its real area and its resident count are probably both larger, so its pressure value could be too high or too low. I still show it, with a warning, instead of hiding it. The rule: if a park's outline were actually *cut* by the study-area edge, its pressure would be shown as "not available".

**Don't add the resident numbers up.** The three catchments overlap a lot: together they come to about 27,900, but the whole kit only has 21,781 residents. Many people are within 15 minutes of two or three parks.

## How it's calculated

- **One coordinate system.** All longitude/latitude coordinates are converted to metres around the kit centre, using the local radii of the GRS80 ellipsoid. The 100 m census cells then measure 9,990–10,008 m², and street geometry matches the stored edge lengths to within 0.14 m.
- **Ways into a park.** There's no entrance data, so every street node inside a park or within 10 m of its edge counts as a way in. Fences and opening hours aren't known.
- **Walking time.** Shortest path (Dijkstra) along `streets.graph.json`, using each edge's `length` in metres, at 80 m per minute (4.8 km/h). From each 10 m square, the app adds a straight walk to the nearest street (max 100 m). No slopes, stairs, crossings or waiting at traffic lights.
- **15-minute catchment.** All street pieces reachable within 1,200 m of a park's ways in, including the reachable part of the last street, plus a **25 m band on each side**, plus the park itself. The 25 m band is an *approximation* of the area served by those streets. It's not a verified pedestrian-access boundary: it doesn't know where front doors are, and it can cross a back garden or a wall.
- **Residents.** For each 100 m census cell (`zensus.geojson`, Zensus 2022), I take its population times the share of the cell inside the catchment. The share is measured with sample points every 5 m, 400 per cell. This assumes people are spread evenly within a cell, which is never quite true: a cell can be half park and half flats. One cell has no published population (`null`). It's left out, not treated as zero, and the panel says when it overlaps. Totals are rounded to 10.
- **Potential pressure** = estimated residents within a 15-minute walk ÷ park area in hectares.

## What the pressure index means, and what it doesn't

It's a proxy for *potential* demand from people living nearby. It doesn't measure visitors, and it doesn't say a park is crowded or quiet. It ignores:
- workers, students and tourists
- people from outside the study area
- what the park actually offers (a playground or a lawn draws people differently)
- how attractive or accessible each park is
- other green space people use, like private gardens or the countryside

A high value for a small park mostly says "many people live near a small green". That's still interesting for planning, but it isn't proof of overuse.

## Limits and missing data

- **Edges.** The study area is only about 1.3 × 2 km, and a 15-minute walk is 1,200 m, so **all three catchments run into the edge of the data**. Residents just outside aren't counted, so every resident count is probably too low. Near the edges, walking times may also be too long, because a closer park outside the study area wouldn't show up.
- **Missing data:**
  - park names and official park boundaries
  - park entrances
  - opening hours and fences
  - visitor counts
  - elevation and slope
  - streets, parks and residents outside the kit
  - where exactly people live inside each 100 m cell
- Census figures are deliberately blurred a little for privacy, so single cells are approximate.

## What I tested

- **Calculation checks** (a Node script run against `src/lib/`):
  - census cells come out at ≈10,000 m²
  - edge lengths match the geometry
  - distances on the network are the same in both directions
  - the network is fully connected
  - counting a catchment that covers everything gives exactly 21,781 residents and skips the 1 `null` cell
  - an empty catchment gives 0
  - no park has more residents than the total
  - every 10 m square under 14 minutes (and within 25 m of a street) lies inside the catchment of its nearest park: 1,823 of 1,823
  - a point 500 m outside the study area is "not routed"
- **Build for GitHub Pages:** I ran `npm run build` with the repository name set, as GitHub does. `dist/index.html` loads its files from `/Sara-walking-map/`, all five data files load under that path, and a plain `/data/…` path fails, as expected.
- **The page itself:** I took screenshots of all three layers in a headless browser, with parks selected. They showed a colour bug (too dark), a camera that cut off the south, and a missing label for park A, and I fixed all three.
- **Not done yet:** the site isn't deployed. That happens when I push to `main`.

## Files

| Path | What it does |
| --- | --- |
| `src/App.jsx` | loads the data, runs the analysis, layout and tooltip |
| `src/lib/geo.js` | metre conversion, areas, distances, point-in-polygon |
| `src/lib/routing.js` | the walking network, shortest paths, reachable street pieces |
| `src/lib/parks.js` | the park rule |
| `src/lib/analysis.js` | walking-time grid, catchments, residents, pressure |
| `src/components/CityScene.jsx` | the 3D map (React Three Fiber) |
| `src/components/Panel.jsx` | layer switch, legend, park details, method |
| `src/components/colors.js` | all colours |
| `public/data/` | the city kit, unchanged. See `SOURCES.md` |

## Data and credit

Buildings: 3D building models LoD2 © GDI-Th (dl-de/by-2-0). Land use and pedestrian network: Egor Gaydukov, InfAU, Bauhaus-Universität Weimar. Census grid: Zensus 2022, © Statistische Ämter des Bundes und der Länder (dl-de/by-2-0).

## How this was made

1. Tools: Claude Code, with the model Claude Opus 5.5.
2. I decided: I decided to explore park accessibility and potential population pressure in central Weimar using an interactive 3D map.
3. The agent did: inspected the data, built the park rule, routing, catchment and population analysis and the 3D map, and tested them, based on my research question and choices.
4. I checked: I checked the map layers and park estimates, keeping in mind that the population pressure index does not represent actual visitor numbers or crowding.
