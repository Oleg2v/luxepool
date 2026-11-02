`inter-tight-subset.woff2` — Inter Tight (variable, wght 100–900) from Google Fonts via
@fontsource-variable/inter-tight, subset to Basic Latin, digits and the few symbols the
page uses (× ± · – — quotes). SIL Open Font License 1.1.

Regenerate:

    pyftsubset node_modules/@fontsource-variable/inter-tight/files/inter-tight-latin-wght-normal.woff2 \
      --unicodes="U+0020-007E,U+00A0,U+00B1,U+00B7,U+00D7,U+2013,U+2014,U+2018,U+2019,U+201C,U+201D,U+2022,U+2026,U+2191,U+2193,U+2212" \
      --layout-features="kern,tnum,lnum,case,ss01,cv11" --flavor=woff2 \
      --output-file=src/assets/fonts/inter-tight-subset.woff2
