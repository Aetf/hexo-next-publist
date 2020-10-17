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

    // apply filtering according to url hash
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

    function updateSelector(select, ...values) {
        console.log('updateSelector', select, values);
        // clear checked on all menu items
        for (const item of select.querySelectorAll('[role="menuitem"]')) {
            item.setAttribute('aria-checked', 'false');
        }
        // apply checked on matching values
        for (const value of values) {
            const item = select.querySelector(`[data-value="${value}"]`);
            if (item !== null) {
                item.setAttribute('aria-checked', 'true');
            }
        }
        // if nothing were selected, select all
        if (select.querySelectorAll('[aria-checked="true"]').length === 0) {
            const item = select.querySelector(`[data-value="!all"]`);
            item.setAttribute('aria-checked', 'true');
        }
        // update summary based on selected items
        const selectedItems = select.querySelectorAll('[aria-checked="true"]');
        const valueTag = select.querySelector('.summary-value');
        if (selectedItems.length === 1) {
            valueTag.textContent = selectedItems[0].textContent;
        } else {
            valueTag.textContent = 'Multiple';
        }
    }

    const FILTER_TO_HIDE = 'publist-filter-tohide';
    const FILTER_SELECTED = 'publist-filter-selected';
    function panelDoFilter(searchPanel, filters) {
        const publist = searchPanel.closest('.publist');
        console.log('Do filter', searchPanel, filters);

        const allSelects = searchPanel.querySelectorAll('details');
        // for all missing names in searchPanel, fill filters with !all
        for (const select of allSelects) {
            const name = select.getAttribute('data-select-for');
            if (!filters.hasOwnProperty(name)) {
                filters[name] = ['!all'];
            }
        }

        // Update panel: for each select in the panel, if it's not in filters, select all.
        // Otherwise select according to filters
        for (const select of allSelects) {
            const name = select.getAttribute('data-select-for');
            updateSelector(select, ...filters[name]);
        }

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
        }
        console.log(filters);

        addClass(document.querySelectorAll('.publist .publist-search-panel .AnimatedEllipsis'), 'd-none');
        document.querySelectorAll('.publist .publist-search-panel')
            .forEach(panel => panelDoFilter(panel, filters));
    }
    window.addEventListener("popstate", hashChanged);
    hashChanged();

    function filtersFromSelect(panel) {
        let filters = {};
        for (const select of panel.querySelectorAll('details')) {
            const name = select.getAttribute('data-select-for');
            filters[name] = Array.from(select.querySelectorAll('[aria-checked="true"]'))
                .map(item => item.getAttribute('data-value'));
            
            // clean up filters
            // step 1: !all covers everything
            if (filters[name].indexOf('!all') !== -1) {
                filters[name] = ['!all'];
            }
            // step 2: each cat '@xxx' covers items of the same cat
            if (true) {
                const covered = new Set(filters[name].filter(e => e.startsWith('@'))
                    .flatMap(e => Array.from(select.querySelectorAll(`[data-value-cat="${e}"`))
                        .map(ee => ee.getAttribute('data-value'))
                    ));
                filters[name] = filters[name].filter(e => !covered.has(e));
            }
            if (filters[name].length === 0) {
                filters[name].push('!all');
            }
        }
        return filters;
    }

    function toggleItem(item) {
        const checked = item.getAttribute('aria-checked') === 'true';
        if (checked) {
            item.setAttribute('aria-checked', 'false');
        } else {
            item.setAttribute('aria-checked', 'true');
        }
    }

    // manipulate url hash via the search panel
    for (const panel of document.querySelectorAll('.publist .publist-search-panel')) {
        for (const item of panel.querySelectorAll('[role="menuitem"]')) {
            const select = item.closest('details');
            const myValue = item.getAttribute('data-value');
            const myValueCat = item.getAttribute('data-value-cat');
            item.addEventListener('click', e => {
                toggleItem(item);
                if (myValue.startsWith('!')) {
                    // all item, pass
                } else if (myValue.startsWith('@')) {
                    // a cat item, clear all
                    select.querySelector('[data-value="!all"]').setAttribute('aria-checked', 'false');
                } else {
                    // a normal item, clear all and corresponding header
                    select.querySelector('[data-value="!all"]').setAttribute('aria-checked', 'false');
                    select.querySelector(`[data-value="${myValueCat}"]`).setAttribute('aria-checked', 'false');
                }

                // update frag
                const filters = filtersFromSelect(panel);
                const frag = assembleFragment(filters);
                history.pushState(null, '', frag);
                hashChanged();
            })
        }
    }

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
