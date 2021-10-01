#!/usr/bin/env python
# Generate new widget/min-color.scss from @primer/css

# require two files:
# first one with all colors
# second one with needed color names

# the first one can be generated with
# rg --no-filename -No -- '--color-[\w-]+:[^};]+' public/assets/publist/main.css | sort | uniq
# the second one similarly after removing all color from main.css
# rg --no-filename -No -- '--color-[\w-]+' public/assets/publist/main.css | sort | uniq

import sys

with open(sys.argv[2]) as f:
    needed = set([
        line.strip()
        for line in f.readlines()
    ])

with open(sys.argv[1]) as f:
    theme = dict(
        line.strip().split(':')
        for line in f
    )

print("/* Genreated by gen-min-color.py */")
print(":root {")
for name in sorted(needed):
    if name in theme:
        print(f'  {name}:{theme[name]};')
    else:
        print(f'{name} not found in theme', file=sys.stderr)
print("}")
