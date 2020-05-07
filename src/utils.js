import katex from 'katex';

export function formatNumber(num) {
    return num.toString().replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,')
}

export function formatCount(count) {
    if (isNaN(count)) return ""
    // Counts are floats in Goh's model, so they need to be rounded.
    // Also formatting to string with space separators etc.
    return formatNumber(Math.round(count))
}

export function formatDelta(delta) {
    if (isNaN(delta)) return ""
    return (delta >= 0 ? '+' : '') + formatCount(delta)
}

export function formatPercent(proportion) {
    if (isNaN(proportion)) return ""
    return `(${(100 * proportion).toFixed(2)}%)`
}

const MONTHS = [
    'zero',
    'Jan',
    'Feb',
    'March',
    'April',
    'May',
    'June',
    'July',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec'
]

export function getMonth(date) {
    return MONTHS[new Intl.DateTimeFormat('en', { month: 'numeric' }).format(date)]
}

export function formatDate(date) {
    const year = new Intl.DateTimeFormat('en', { year: 'numeric' }).format(date)
    const month = new Intl.DateTimeFormat('en', { month: '2-digit' }).format(date)
    const day = new Intl.DateTimeFormat('en', { day: '2-digit' }).format(date)
    return `${day}.${month}.${year}`
}

export function getDate(firstBarDate, days) {
    return formatDate(addDays(firstBarDate, days))
}

export function addDays(date, days) {
    var result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

export function math_inline(str) {
    return katex.renderToString(str, {
    throwOnError: false,
    displayMode: false,
    colorIsTextColor: true
    });
}

export function math_display(str) {
    return katex.renderToString(str, {
    throwOnError: false,
    displayMode: true,
    colorIsTextColor: true
    });
}

export const padding = { top: 20, right: 0, bottom: 20, left: 25 };

export const MODEL_GOH = 'goh'
export const MODEL_CUSTOM = 'customScenario'