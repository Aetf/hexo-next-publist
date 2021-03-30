import yaml
import sys

with open(sys.argv[1]) as f:
    c = yaml.load(f)

venues = {}

for cat, catVals in c['venues'].items():
    for confKey, conf in catVals.items():
        if conf['venue'] not in venues:
            venues[conf['venue']] = {
                'category': cat,
                'occurrences': []
            }
        # build a new dict to control key ordering
        occr = {'key': confKey}
        occr.update(conf)
        del occr['venue']
        venues[conf['venue']]['occurrences'].append(occr)
c['venues'] = venues
c['version'] = 2
print(yaml.dump(c, sort_keys=False))
