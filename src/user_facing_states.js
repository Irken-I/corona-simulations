export class UFState {
  constructor(susceptible, inf, hospitalized, icu, recovered, fatalities) {
    this['susceptible'] = susceptible
    this['infected'] = inf
    this['hospitalized'] = hospitalized
    this['icu'] = icu
    this['recovered'] = recovered
    this['fatalities'] = fatalities
  }
}

export function getDefaultStateMeta() {
    return [
        {
        'key': 'susceptible',
        'tooltip_title': 'Susceptibles',
        'tooltip_desc': 'Population not immune to the disease',
        'checkable': false,
        'checked': false,
        'color': '#c8ffba',
        },
        {
        'key': 'infected',
        'tooltip_title': 'Infectados',
        'tooltip_desc': 'Infeccionees activas (incl. incu, sin diag) (excl. hosp, UCI)',
        'checkable': true,
        'checked': true,
        'color': '#f0027f',
        },
        {
        'key': 'hospitalized',
        'tooltip_title': 'Hospitalizados',
        'tooltip_desc': 'Hospitalizaciones activas (excluyendo UCI)',
        'checkable': true,
        'checked': true,
        'color': '#8da0cb'
        },
        {
        'key': 'icu',
        'tooltip_title': 'UCI',
        'tooltip_desc': 'Pacientes activos en cuidados intensivos',
        'checkable': true,
        'checked': true,
        'color': '#386cb0',
        },
        {
        'key': 'recovered',
        'tooltip_title': 'Recuperados',
        'tooltip_desc': 'Número acumulado de recuperados',
        'checkable': true,
        'checked': false,
        'color': '#4daf4a',
        },
        {
        'key': 'fatalities',
        'tooltip_title': 'Muertos',
        'tooltip_desc': 'Número acumulado de muertos',
        'checkable': true,
        'checked': true,
        'color': "#000000",
        },
    ]
}