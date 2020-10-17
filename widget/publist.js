function publist() {
    // copy function for research publication page
    function fallbackMessage(action) {
        var actionMsg = '';
        var actionKey = (action === 'cut' ? 'X' : 'C');

        if (/iPhone|iPad/i.test(navigator.userAgent)) {
            actionMsg = 'No support :(';
        } else if (/Mac/i.test(navigator.userAgent)) {
            actionMsg = 'Press ⌘-' + actionKey + ' to ' + action;
        } else {
            actionMsg = 'Press Ctrl-' + actionKey + ' to ' + action;
        }

        return actionMsg;
    }

    function showTooltip(elem, msg) {
        elem.classList.add('tooltipped', 'tooltipped-s', 'tooltipped-no-delay');
        elem.setAttribute('aria-label', msg);
    }

    function closeTooltip(elem) {
        elem.classList.remove('tooltipped', 'tooltipped-s', 'tooltipped-no-delay');
        elem.setAttribute('aria-label', '');
    }

    function oneshotCloseTooltip(evt, elem) {
        evt.target.removeEventListener(evt.type, arguments.callee);
        closeTooltip(elem);
    }

    const cp = new ClipboardJS('.pub-list .pub-links .pub-link-bibtex');
    cp.on('success', function (e) {
        e.clearSelection();

        showTooltip(e.trigger, 'Copied!');
        e.trigger.addEventListener('mouseleave', evt => oneshotCloseTooltip(evt, e.trigger));
    });
    cp.on('error', function(e) {
        showTooltip(e.trigger, fallbackMessage(e.action));
        e.trigger.addEventListener('mouseleave', evt => oneshotCloseTooltip(evt, e.trigger));
    });

    // show abstract
    document.querySelectorAll('.pub-block .pub-link-abstract').forEach((elem) => {
        elem.addEventListener('click', () => {
            const tgt = elem.closest('.pub-block').querySelector('.pub-abstract-frame');
            tgt.classList.toggle('shown');
            if (tgt.classList.contains('shown')) {
                tgt.style.height = `${tgt.scrollHeight}px`;
                tgt.scrollIntoView({
                    behavior: 'smooth',
                    block: 'nearest',
                });
            } else {
                tgt.style.height = `0px`;
            }
        });
    });

    // filters
    function addClass(elems, ...className) {
        elems.forEach(elem => elem.classList.add(...className));
    }
    function removeClass(elems, ...className) {
        elems.forEach(elem => elem.classList.remove(...className));
    }

    // search fragment meaning:
    // search fragment := # (<term>)*
    // term := / <type> : <value> (, <value>)*
    // type := venue | tag | topic
    // value := !all | @cat | <literal>
    // literal := abc | dea | dfsd
    const fragRegex = /^#(\/\w+:([@!]?[^@,\/#]+)(,[@!]?[^@,\/#]+)*)+$/;
    function parseFragment(frag) {
        console.log('frag is ', frag);

        let filters = {};
        if (frag == null || !fragRegex.test(frag)) {
            return filters;
        }
        frag = frag.slice(1);  // remove begining '#'
        for (const part of frag.split('/')) {
            if (part.length === 0) {
                continue;
            }
            const [name, values] = part.split(':');
            const valueParts = values.split(',');
            if (valueParts.indexOf('!all') !== -1) {
                // the filter does not filter anything, just skip it
                continue;
            }
            filters[name] = valueParts;
        }
        return filters;
    }

    function assembleFragment(filters) {
        const frag = Object.keys(filters).map(name => {
            if (filters[name].length === 0) {
                return '';
            }
            const values = filters[name].join(',');
            return `/${name}:${values}`;
        })
        .join('');
        return `#${frag}`;
    }

    const FILTER_TO_HIDE = 'publist-filter-tohide';
    const FILTER_SELECTED = 'publist-filter-selected';
    function panelDoFilter(searchPanel, filters) {
        const publist = searchPanel.closest('.publist');
        console.log('Do filter', searchPanel, filters);
        // update panel

        // update publist
        // step 1: mark all selected li
        for (const name of Object.keys(filters)) {
            const values = filters[name];
            for (const value of filters[name]) {
                let li = [];
                if (value === '!all') {
                    li = publist.querySelectorAll('.pub-list li');
                } else if (name === 'venue' && value.startsWith('@')) {
                    // special handling of venue, which has categories
                    li = publist.querySelectorAll(`.pub-list li[data-pub-cat="${value.slice(1)}"]`);
                } else {
                    li = publist.querySelectorAll(`.pub-list li[data-pub-${name}="${value}"]`);
                }
                addClass(li, FILTER_SELECTED);
            }
        }
        // step 2: mark everything not selected as tohide, and remove the selected class
        addClass(publist.querySelectorAll(`.pub-list li:not(.${FILTER_SELECTED})`), FILTER_TO_HIDE);
        removeClass(publist.querySelectorAll(`.pub-list .${FILTER_SELECTED}`), FILTER_SELECTED);
        // step 3: diff the hide and tohide classes and apply hide which actually hides the elements
        // hide the whole section if it's empty
        publist.querySelectorAll('.pub-list section.year').forEach(section => {
            const items = section.querySelectorAll(`li.${FILTER_TO_HIDE}`);
            if (items.length == section.querySelectorAll('li').length) {
                section.classList.add(FILTER_TO_HIDE);
                removeClass(items, FILTER_TO_HIDE);
            }
        });
        // hide those are not already hidden in this update
        addClass(publist.querySelectorAll(`.pub-list .${FILTER_TO_HIDE}:not(.filter-hide)`), 'filter-hide');
        // unhide those should not be hidden in this update
        removeClass(publist.querySelectorAll(`.pub-list .filter-hide:not(.${FILTER_TO_HIDE})`), 'filter-hide');
        // remove tohide
        removeClass(publist.querySelectorAll(`.pub-list .${FILTER_TO_HIDE}`), FILTER_TO_HIDE);
    }

    function hashChanged() {
        const filters = parseFragment(location.hash);
        const frag = assembleFragment(filters);
        if (frag !== location.hash) {
            console.log(`Replacing hash '${location.hash}' with '${frag}'`);
            history.replaceState(null, '', frag);
            return;
        }
        console.log(filters);

        document.querySelectorAll('.publist .timeline-search-panel')
            .forEach(panel => panelDoFilter(panel, filters));
    }
    window.addEventListener("popstate", hashChanged);
    hashChanged();

    document.querySelectorAll('.publist .timeline-search-panel').forEach(searchPanel => {
        const publist = searchPanel.closest('.publist');
        const select = searchPanel.querySelector('.select-box select');

        const updateFilter = () => {
            // check select
            const venue = select.value;
            if (venue !== 'all') {
                addClass(publist.querySelectorAll(`.pub-list li:not([data-pub-venue="${venue}"])`), 'filter-tohide');
            }
            // check boxes
            let toHide = searchPanel.querySelectorAll('.check-box input[type="checkbox"]:not(:checked)');
            toHide = Array.from(toHide);
            toHide = toHide.flatMap(elem => {
                const cat = elem.getAttribute('value');
                return Array.from(publist.querySelectorAll(`.pub-list li[data-pub-cat="${cat}"]`));
            });
            addClass(toHide, 'filter-tohide');
            // hide the whole section if it's empty
            publist.querySelectorAll('.pub-list section.year').forEach(section => {
                const items = section.querySelectorAll('li.filter-tohide');
                if (items.length == section.querySelectorAll('li').length) {
                    section.classList.add('filter-tohide');
                    removeClass(items, 'filter-tohide');
                }
            });

            // hide those are not selected in this update
            addClass(publist.querySelectorAll('.pub-list .filter-tohide:not(.filter-hide)'), 'filter-hide');
            // unhide those are selected in this update
            removeClass(publist.querySelectorAll('.pub-list .filter-hide:not(.filter-tohide)'), 'filter-hide');
            // remove tohide
            removeClass(publist.querySelectorAll('.pub-list .filter-tohide'), 'filter-tohide');
        };
        select.addEventListener('change', updateFilter);
        searchPanel.querySelectorAll('.check-box input[type="checkbox"]')
            .forEach(elem => elem.addEventListener('change', updateFilter));
    });
}

document.addEventListener('DOMContentLoaded', () => {
    publist();
});
