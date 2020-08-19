$(document).on('bootstrap:after', function () {
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

    var $pubBibtexs = $('.pub-list .pub-links .pub-link-bibtex');
    if ($pubBibtexs.length > 0) {
        var tooltip = new jBox('Tooltip', {
            id: 'copied-tooltip',
            position: {
                x: 'center',
                y: 'bottom'
            },
            outside: 'y',
            adjustPosition: true,
            adjustTracker: true,
            pointer: true,
            theme: 'TooltipDark',
        });
        function showTooltip(elem, msg) {
            tooltip.setContent(msg);
            tooltip.open({ target: elem });
        }

        $pubBibtexs.on('mouseleave', function () { tooltip.close(); });
        $pubBibtexs.on('blur', function () { tooltip.close(); });

        var cp = new ClipboardJS('.pub-list .pub-links .pub-link-bibtex');
        cp.on('success', function (e) {
            e.clearSelection();

            showTooltip(e.trigger, 'Copied!');
        });
        cp.on('error', function(e) {
            showTooltip(e.trigger, fallbackMessage(e.action));
        });
    }

    // show abstract
    var $pubAbstract = $('.pub-block .pub-link-abstract');
    if ($pubAbstract.length > 0) {
        $pubAbstract.on('click', function() {
            var $elem = $(this).closest('.pub-block').find('.pub-abstract');
            var slideDir = $elem.is(':visible') ? 'slideUp' : 'slideDown';
            $elem.velocity(slideDir);
        });
    }

    // filters
    function updateFilter() {
        // check select
        var venue = $('.timeline-search-panel .select-box select').val();
        if (venue !== 'all') {
            $('.pub-list li:not([data-pub-venue="' + venue + '"])').addClass('filter-tohide');
        }
        // check boxes
        $('.timeline-search-panel .check-box input[type="checkbox"]:not(:checked)')
            .each(function () {
            var cat = $(this).attr('value');
            $('.pub-list li[data-pub-cat="' + cat + '"').addClass('filter-tohide');
        });

        // hide the whole section if it's empty
        $('.pub-list section.year').each(function () {
            var $items = $(this).find('li.filter-tohide');
            if ($items.length === $(this).find('li').length) {
                $(this).addClass('filter-tohide');
                $items.removeClass('filter-tohide')
            }
        });

        // hide those are not selected in this update
        $('.pub-list .filter-tohide:not(.filter-hide)').addClass('filter-hide');
        // unhide those are selected in this update
        $('.pub-list .filter-hide:not(.filter-tohide)').removeClass('filter-hide');
        // remove tohide
        $('.pub-list .filter-tohide').removeClass('filter-tohide');
    }
    $('.timeline-search-panel .check-box input[type="checkbox"]').change(updateFilter);
    $('.timeline-search-panel .select-box select').change(updateFilter);
})
