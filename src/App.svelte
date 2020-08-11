<script>
  // Libraries
  import { scaleLinear } from "d3-scale";
  import { onMount } from 'svelte';
  import { selectAll } from 'd3-selection'
  import { drag } from 'd3-drag';
  import queryString from "query-string";
  import { format } from 'd3-format';
  import { event } from 'd3-selection';
  import Icon from 'svelte-awesome';
  import { search, plus, exclamationCircle, times, question } from 'svelte-awesome/icons';
  import katex from 'katex';

  // Custom Svelte components
  import Chart from './components/Chart.svelte';
  import ChartCompanion from './components/ChartCompanion.svelte';
  import Checkbox from './components/Checkbox.svelte';
  import Arrow from './components/Arrow.svelte';
  import HistoryMarker from './components/HistoryMarker.svelte';
  import ActionMarker from './components/ActionMarker.svelte';
  import ParameterKnob from './components/ParameterKnob.svelte';
  import Collapsible from './components/Collapsible.svelte';

  // Custom utilities
  import { ActionMarkerData, AM_DAY } from './action_marker_data.js';
  import { UFState, getDefaultStateMeta } from './user_facing_states.js';
  import { get_solution_from_gohs_seir_ode, goh_default_action_markers } from './models/gohs_seir_ode.js';
  import { map_berkeley_states_into_UFStates, parse_berkeley, get_berkeley_action_markers } from './models/berkeley_abm.js';
  import { createHistoricalEstimates } from './models/historical_estimates.js';
  import { getDate, addDays, formatCount, formatDelta, MODEL_GOH, MODEL_CUSTOM, stylizeExpressions } from './utils.js';
  import { math_inline, math_display, padding } from './utils.js';

  // Static data imports
  import paramConfig from './paramConfig.json';
  import hs_parsed from '../data/hs_parsed.json';
  import latestRtEstimate from './../data/latest_Rt.csv';

  function range(n){
    return Array(n).fill().map((_, i) => i);
  }

  function get_R0_from_Rt(Rt, goh_states_fin) {
    const prop_susceptible = goh_states_fin[goh_states_fin.length-1][0]
    return parseFloat((Rt / prop_susceptible).toFixed(2))
  }

  // Motivation: when we zoom out, Chart needs every nth datapoint from P.
  function get_every_nth(P, n) {
    var arr = []
    for (var i=0; i<P.length; i+=n) {
      arr.push(P[i])
    }
    return arr
  }

  function replaceFuturiceFromTextWithLogo(text) {
    return text.replace('Futurice', '<img alt="Futurice" style="vertical-align:middle; padding: 0px 5px 5px 5px;" width="80" src="futurice.png">')
  }

  let collapsed = {}

  let display_scenario_dropdown = false
  let custom_scenario_url_prefix = 'https://coronastoragemyvs.blob.core.windows.net/coviducb/'
  let custom_scenario_url_postfix = '-outcome_1.json'

  let oneLineAttribution = `Corosim was created by <a href="https://futurice.com/" style="color: #009f77;">Futurice</a> on top of <a href="https://gabgoh.github.io/">Gabriel Goh's</a> <a href="https://gabgoh.github.io/COVID/index.html">Epidemic Calculator</a>.`

  // R0 paramConfig is stored at a separate object because its default value is updated by a reactive function.
  // Do not refactor into paramConfig.
  let paramConfigR0 = {
    description: `Tasa basica de reproducción {R0}`,
    isDefaultValueAutomaticallyGeneratedFromData: true,
    defaultValue: 2, // Will be overwritten by a reactive function.
    minValue: 0.01,
    maxValue: 5,
    stepValue: 0.01,
    unitsDescriptor: '',
    isInteger: false,
    isPercentage: false,
    longformDescription: `Informally, {R0} describes how easily a virus can spread in a population.
                          Note that {R0} is not just a property of the virus: the behavior of individuals
                          within a population also affects how easily a virus can spread. To be specific,
                          {R0} describes the number of new infections expected to be caused by a typical infected
                          person within a population <i>where everyone is susceptible to the disease</i>.
                          For example, if ${math_inline('\\mathcal{R}_0=2')}, then one infected person
                          would be expected to infect 2 other people (on average, if everyone in the
                          population was susceptible).`,
    longformDoNotConfuseWith: `{Rt}, the <i>effective</i> reproduction number, describes the same thing,
                               except for the assumption regarding susceptible population. {Rt} describes
                               how many new infections are <i>effectively</i> caused by a typical infected
                               person within a population (without assuming that everyone is susceptible to
                               the disease). In the beginning of the epidemic, both {Rt} and {R0} are
                               very close to each other. However, as more and more people have had the disease,
                               they have (presumably) developed an immunity towards it. This makes it increasingly
                               harder for the virus to spread, causing {Rt} to diverge lower from {R0}.
                               `,
    longformEffects: "",
    longformDefaultValueJustification: `The default value for {R0} is estimated from 7 days of confirmed case counts.
                                        This default value is not hardcoded, it is updated daily as new data comes in.
                                        Because of delays in recording new cases, we do not use the most recent 7 days:
                                        we exclude the most recent 5 days and then take the next 7 days.<br>
                                        
                                        <img src="latest_Rt.png" alt="Rt estimates over time" title="Rt estimates over time"/><br>

                                        There are many methods to estimate reproduction numbers from data. We use a Bayesian
                                        approach described by <a href="https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0002185">Bettencourt
                                        & Ribeiro</a> in their 2008 paper "Real Time Bayesian Estimation of the Epidemic Potential
                                        of Emerging Infectious Diseases"</a>, which was
                                        <a href="http://systrom.com/blog/the-metric-we-need-to-manage-covid-19/">adapted and modified</a>
                                        for the COVID-19 epidemic by Kevin Systrom. This method gives us an estimate of {Rt},
                                        which we convert to {R0} by considering our estimate of the proportion of susceptible population p:
                                        <br><br>
                                        ${math_inline('\\mathcal{R}_t = \\mathcal{R}_0 * p')}
                                        
                                        <br><br>
                                        If you would like to double-check our computations on Finnish data, see
                                        <a href="https://github.com/futurice/covid-19-R_t-estimating/blob/master/finland.ipynb">this notebook</a>.
                                        
                                        `

  }

  function setDefaultParamsR0(latestR0EstimateValue, latestRtEstimateDate) {
    paramConfigR0.defaultValue = latestR0EstimateValue
  }


  $: N                 = 50372424 // 2020 Poblacion de Colombia
  $: logN              = Math.log(N)
  $: I0                = 1
  $: undetected_infections = paramConfig["undetected_infections"].defaultValue
  $: unrecorded_deaths = paramConfig["unrecorded_deaths"].defaultValue
  $: D_incbation       = paramConfig["days_from_incubation_to_infectious"].defaultValue
  $: D_infectious      = paramConfig["days_from_infectious_to_not_infectious"].defaultValue
  $: D_recovery_mild   = paramConfig["days_in_mild_recovering_state"].defaultValue
  $: D_hospital        = paramConfig["days_in_hospital"].defaultValue
  $: CFR               = paramConfig["fatality_rate"].defaultValue
  $: Time              = 220
  $: Xmax              = 110000
  $: dt                = 2
  $: P_SEVERE          = paramConfig["hospitalization_rate"].defaultValue
  $: P_ICU             = paramConfig["icu_rate_from_hospitalized"].defaultValue
  $: icuCapacity       = paramConfig["icu_capacity"].defaultValue

  function toggleZoomStates() { 
    dt *= 2
    if (dt > 4) dt = 2
  }

  function closePopup() {
    popupHTML = ''
  }

  function addActionMarker() {
    actionMarkers[selectedModel].push(new ActionMarkerData(99*dt, undefined, -0.1, true))
    actionMarkers = actionMarkers // Trigger re-render
  }

  function getlastHistoricBar(P_all_historical, dt) {
    if (!P_all_historical) return 0
    return get_every_nth(P_all_historical, dt).length - 1 // TODO optimize this to be more efficient
  }

  function with_enough_days(P, dt) {
    var augmented = []
    for (var i=0; i<P.length; i++) {
      augmented.push(P[i])
    }
    // If we have too few values, augment with empty so that the Chart renders properly.
    while (augmented.length < 101*dt) {
      augmented.push(new UFState(0,0,0,0,0,0))
    }
    return augmented
  }

  function take_slice_from_beginning(P, dt) {
    var augmented = []
    for (var i=0; i<P.length; i++) {
      augmented.push(P[i])
    }
    // If we have too many values, take desired slice from the beginning.
    augmented = augmented.slice(0, 101*dt)
    return augmented
  }

  function getPmax(P_bars, states) {
    var Pmax = 0
    for (var i=0; i<P_bars.length; i++) {
      const bars = P_bars[i]
      var curr = 0
      for (var j=0; j<states.length; j++) {
        const state = states[j]
        if (state['checked']) {
          const k = state['key']
          curr += P_bars[i][k]
        }
      }
      if (curr > Pmax) {
        Pmax = curr
      }
    }
    return Pmax
  }





  /********************************** Generate state (choose which model to run, run it with user specified parameters, etc.) *********************************/

  function debugHelper([... vars]) {
    if (vars.length == 0) return
    console.log('*** DEBUG ***')
    for (var i=0; i<vars.length; i++) {
      console.log(vars[i])
    }
  }

  function fetchCustomScenarioAsync() {
    customScenarioStatus = 'Fetching data...'
    const url = custom_scenario_url_prefix + customScenarioGUID + custom_scenario_url_postfix
    fetch(url, { 
      method: 'GET'
    })
    .then((response) => {
      if (!response.ok) {
        showUserError(response)
      }
      return response
    })
    .then(function(response) {
      return response.json();
    })
    .then(function(json) {
      parseCustomScenario(json)
    })
    .catch(error => {
      showUserError(error)
    });
  }

  let customScenarioStatus = ''

  function showUserError(thing) {
    customScenarioStatus = 'Error fetching scenario'
    console.log(thing)
  }

  function parseCustomScenario(json) {
    customScenarioStatus = '' // Clear out "Fetching..." message
    P_all_fetched = parse_berkeley(json["scenario_states"], json["scenario_params"], N)
    custom_params = {...json["scenario_params"], ...json["parameters"]}
    actionMarkers = actionMarkerHelper(P_all_historical, custom_params)
  }

  function get_solution(selectedModel, P_all_fetched, actionMarkers, goh_states_fin, dt, N, I0, R0, D_incbation, D_infectious, D_recovery_mild, D_hospital, P_SEVERE, P_ICU, CFR) {
    if (selectedModel === MODEL_GOH) {
      return get_solution_from_gohs_seir_ode(actionMarkers[selectedModel], goh_states_fin, dt, N, I0, R0, D_incbation, D_infectious, D_recovery_mild, D_hospital, P_SEVERE, P_ICU, CFR)
    } else if (selectedModel === MODEL_CUSTOM) {
      return P_all_fetched
    } else {
      console.log('Error! getSolution does not have handling for model ', selectedModel)
    }
  }

  function actionMarkerHelper(P_all_historical, custom_params) {
    const m = actionMarkers || {}
    if (!m[MODEL_GOH]) {
      // Action markers for Goh have not been set yet; set to default values.
      m[MODEL_GOH] = goh_default_action_markers(P_all_historical)
    } else {
      // Action markers for Goh have been set, but we may have to adjust them
      // in case historymarker has been moved to the right.
      for (var i=0; i<m[MODEL_GOH].length; i++) {
        const actionMarker = m[MODEL_GOH][i]
        if (actionMarker[AM_DAY] < P_all_historical.length) {
          actionMarker[AM_DAY] = P_all_historical.length
        }
      }
    }
    if (custom_params['0']) {
      m[MODEL_CUSTOM] = get_berkeley_action_markers(P_all_historical.length, custom_params)
    } else if (!m[MODEL_CUSTOM]) {
      m[MODEL_CUSTOM] = []
    }
    return m
  }
  
  let customScenarioGUID   = queryString.parse(location.search).customScenario
  let P_all_fetched   = [] // For "Custom scenario": empty array until we get data.
  let custom_params   = {} // Empty "parameters object" as placeholder until we get data.

  $: selectedModel    = customScenarioGUID ? MODEL_CUSTOM : MODEL_GOH

  $: [firstHistoricalDate, goh_states_fin_before_slicing, P_all_historical_before_slicing] = createHistoricalEstimates(hs_parsed, N, D_incbation, D_infectious, D_recovery_mild, D_hospital, P_SEVERE, P_ICU, CFR, undetected_infections, unrecorded_deaths)
  $: firstBarDate     = firstHistoricalDate

  $: lastHistoricDay       = P_all_historical_before_slicing.length-1
  $: cutoffHistoricDay     = cutoffHistoricDay ? cutoffHistoricDay : lastHistoricDay+1
  $: P_all_historical      = P_all_historical_before_slicing.slice(0, cutoffHistoricDay)
  $: goh_states_fin        = goh_states_fin_before_slicing.slice(0, cutoffHistoricDay)
  $: latestRtEstimateValue = Number.parseFloat(latestRtEstimate[0]["Rt"])
  $: latestRtEstimateDate  = latestRtEstimate[0]["date"]
  $: latestR0EstimateValue = get_R0_from_Rt(latestRtEstimateValue, goh_states_fin)
  $: R0                    = R0 ? R0 : latestR0EstimateValue
  $: setDefaultParamsR0(latestR0EstimateValue, latestRtEstimateDate)
  $: lastHistoricBar       = getlastHistoricBar(P_all_historical, dt)

  $: actionMarkers    = actionMarkerHelper(P_all_historical, custom_params)
  $: stateMeta        = getDefaultStateMeta()

  $: P_all_future     = get_solution(
                          selectedModel,
                          P_all_fetched,
                          actionMarkers,
                          goh_states_fin,
                          dt,
                          N,
                          I0,
                          R0,
                          D_incbation,
                          D_infectious,
                          D_recovery_mild,
                          D_hospital,
                          P_SEVERE,
                          P_ICU,
                          CFR
                        )
  $: P_all            = with_enough_days(P_all_historical.concat(P_all_future), dt)
  $: P_bars           = get_every_nth(take_slice_from_beginning(P_all, dt), dt)
  $: timestep         = dt
  $: tmax             = dt*101
  $: Pmax             = getPmax(P_bars, stateMeta)
  $: lock             = false
  $: debugHelp        = debugHelper([])
  $: flashMessage     = ''
  $: popupHTML        = ''

  var Plock = 1

  var drag_y = function (){
    var dragstarty = 0
    var Pmaxstart = 0

    var dragstarted = function (d) {
      dragstarty = event.y  
      Pmaxstart  = Pmax
    }

    var dragged = function (d) {
      Pmax = Math.max( (Pmaxstart*(1 + (event.y - dragstarty)/500)), 10)
    }

    return drag().on("drag", dragged).on("start", dragstarted)
  }

  var drag_x = function (){
    var dragstartx = 0
    var dtstart = 0
    var Pmaxstart = 0
    var dragstarted = function (d) {
      dragstartx = event.x
      dtstart  = dt
      Plock = Pmax
      lock = true
    }
    var dragged = function (d) {
      dt = dtstart - 0.0015*(event.x - dragstartx)
    }
    var dragend = function (d) {
      lock = false
    }
    return drag().on("drag", dragged).on("start", dragstarted).on("end", dragend)
  }

  $: parsed = "";
  onMount(async () => {

    if (customScenarioGUID) {
      fetchCustomScenarioAsync()
    }

    var drag_callback_y = drag_y()
    drag_callback_y(selectAll("#yAxisDrag"))

  });

  function lock_yaxis(){
    Plock = Pmax
    lock  = true
  }

  function unlock_yaxis(){
    lock = false
  }

  let width  = 750;
  let height = 400;
  

  $: xScaleTime = scaleLinear()
    .domain([0, tmax])
    .range([padding.left, width - padding.right]);

  $: xScaleTimeInv = scaleLinear()
    .domain([0, width])
    .range([0, tmax]);

  $: indexToTime = scaleLinear()
    .domain([0, P_bars.length])
    .range([0, tmax])

  window.addEventListener('mouseup', unlock_yaxis);

  function activeHelper(active, lastHistoricBar) {
    if (active >= 0) {
      // Case: User hovers over a bar or has locked a bar.
      return active
    }
    return Math.min(lastHistoricBar, 100)
  }

  $: active  = 0
  $: active_ = activeHelper(active, lastHistoricBar)

  var Tinc_s = "\\color{#CCC}{T^{-1}_{\\text{inc}}} "
  var Tinf_s = "\\color{#CCC}{T^{-1}_{\\text{inf}}}"
  var Rt_s   = "\\color{#CCC}{\\frac{\\mathcal{R}_{t}}{T_{\\text{inf}}}} "
  $: ode_eqn = katex.renderToString("\\frac{d S}{d t}=-" +Rt_s +"\\cdot IS,\\qquad \\frac{d E}{d t}=" +Rt_s +"\\cdot IS- " + Tinc_s + " E,\\qquad \\frac{d I}{d t}=" + Tinc_s + "E-" + Tinf_s+ "I, \\qquad \\frac{d R}{d t}=" + Tinf_s+ "I", {
    throwOnError: false,
    displayMode: true,
    colorIsTextColor: true
  });
  
  $: p_num_ind = 40

  function get_icu_peak(P) {

    function argmax(k) {
      var maxVal = 0
      var maxValIndex = 0
      for (var i=0; i<P.length; i+=1) {
        const val = P[i][k]
        if (val > maxVal) {
          maxVal = val
          maxValIndex = i
        }
      }
      return maxValIndex
    }

    const peakICUDay = argmax('icu')
    const peakICUCount = Math.round(P[peakICUDay]['icu'])
    return [peakICUDay, peakICUCount]
  }

  $: [peakICUDay, peakICUCount] = get_icu_peak(P_all)

  function get_milestones(P, firstBarDate, cutoffHistoricDay, dt) {

    var milestones = []
    
    // First death milestone
    for (var i = 0; i < P.length; i+=1) {
      if (P[i]['fatalities'] >= 0.5) {
        milestones.push([i, "Primera Muerte"])
        break
      }
    }
    
    // Peak ICU milestone
    milestones.push([peakICUDay, "Pico: " + format(",")(peakICUCount) + " UCI"])

    // Historical date offset milestone
    const lastHistoricDate = getDate(firstBarDate, cutoffHistoricDay-1)
    milestones.push([cutoffHistoricDay-1, lastHistoricDate])

    // Filter out milestones which are outside the currently zoomed in area
    milestones = milestones.filter(milestone => {
      return milestone[0] < 300*dt
    })

    return milestones
  }

  $: milestones = get_milestones(P_all, firstBarDate, cutoffHistoricDay, dt)
  $: log = true

</script>

<link rel="stylesheet" href="katex.css">

<style>
  .small { font: italic 6px Source Code Pro; }
  @font-face {
    font-family: 'Source Code Pro';
    font-style: normal;
    font-weight: 400;
    font-display: swap;
    src: local('Source Code Pro Regular'), local('SourceCodePro-Regular'), url(fonts/HI_SiYsKILxRpg3hIP6sJ7fM7PqlPevW.woff2) format('woff2');
    unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
  }

  
  @font-face {
    font-family: 'Liberation Sans';
    font-style: normal;
    font-weight: normal;
    font-display: swap;
    src: url(fonts/LiberationSans-Regular.ttf) format('truetype')
  }

  @font-face {
    font-family: 'Liberation Sans';
    font-style: normal;
    font-weight: bold;
    font-display: swap;
    src: url(fonts/LiberationSans-Bold.ttf) format('truetype')
  }

  @font-face {
    font-family: 'Liberation Sans';
    font-style: italic;
    font-weight: normal;
    font-display: swap;
    src: url(fonts/LiberationSans-Italic.ttf) format('truetype')
  }

  @font-face {
    font-family: 'Liberation Sans';
    font-style: italic;
    font-weight: bold;
    font-display: swap;
    src: url(fonts/LiberationSans-BoldItalic.ttf) format('truetype')
  }

  :global(html) {
      overflow-y: scroll;
      font-family: 'Liberation Sans';
  }

  h2 {
    margin: auto;
    width: 950px;
    font-size: 40px;
    padding-top: 20px;
    padding-bottom: 0px;
    font-weight: 300;
  }

  h5 {
    margin: auto;
    margin-top: 0;
    width: 950px;
    font-size: 16px;
    padding-left: 40px;
    padding-bottom: 20px;
    font-weight: 300;
    font-style: italic;
    padding-bottom: 30px
  }

  .center {
    margin: auto;
    width: 950px;
    padding-bottom: 20px;
    font-weight: 300;
    color:#666;
    font-size: 16.5px;
    text-align: justify;
    line-height: 24px
  }

  .ack {
    margin: auto;
    width: 950px;
    padding-bottom: 20px;
    font-weight: 300;
    color:#333;
    font-size: 13px;
  }

  .row {
    margin: auto;
    display: flex;
    width: 948px;
    font-size: 13px;
  }

  .column {
    flex: 158px;
    padding: 0px 5px 5px 0px;
    margin: 0px 5px 5px 5px;
    /*border-top: 2px solid #999*/
  }

  .minorTitle {
    margin: auto;
    display: flex;
    width: 950px;
    font-size: 17px;
    color: #666;
  }

  .minorTitleColumn{
    flex: 60px;
    padding: 3px;
    border-bottom: 2px solid #999;
  }


  .paneltext{
    position:relative;
  }

  .paneltitle{
    color:#777; 
    line-height: 17px; 
    padding-bottom: 4px;
    font-weight: 700;
  }

  .paneldesc{
    color:#888; 
    text-align: left;
    font-weight: 300;
  }

  .slidertext{
    color:#555; 
    line-height: 7px; 
    padding-bottom: 0px; 
    padding-top: 7px;
    font-family: 'Source Code Pro', monospace;
    font-size: 10px;
    text-align: right;
    /*font-weight: bold*/
  }
    
  .range {
    width: 100%;
  }

  .chart {
    width: 100%;
    margin: 0 auto;
    padding-top:0px;
    padding-bottom:10px;
  }

  /* TODO should be moved to global.css because this is copypasted into 3 components. */
  .legendtext{
    color:#888; 
    font-size:13px;
    padding-bottom: 5px;
    font-weight: 300;
    line-height: 14px;
  }

  .tick {
    font-size: .725em;
    font-weight: 200;
    font-size: 13px
  }

  td { 
    text-align: left;
    border-bottom: 1px solid #DDD;
    border-collapse: collapse;
    padding: 3px;
    /*font-size: 14px;*/
  }

  tr {
    border-collapse: collapse;
    border-spacing: 15px;
  }

  .eqn {
    margin: auto;
    display: flex;
    flex-flow: row wrap;
    width: 950px;
    column-count: 4;
    font-weight: 300;
    color:#666;
    font-size: 16.5px;
  }

  :global(.clickableIcons:hover) {
    cursor: pointer;
    color: #777 !important;
  }

  @media screen and (max-width: 1199px) {
      .mobileWarning {
        margin-top: 0px;
        margin-bottom: 40px;
      }
  }

  @media screen and (min-width: 1200px) {
      .mobileWarning {
        visibility: hidden;
        position: absolute;
      }
  }

  th { font-weight: 500; text-align: left; padding-bottom: 5px; vertical-align: text-top;     border-bottom: 1px solid #DDD; }

  a:link { color: grey; }
  a:visited { color: grey; }

</style>


<h2><div>
  <span style=""> </span>
  <img style="vertical-align:middle" src="flag.png" title="Finland" alt="finnish flag" width="400">
</div></h2>
<h5> </h5>

<div class="mobileWarning">
  <h3>Lo sentimos, esta app no esta optimizada para pantallas pequeñas.</h3>
</div>

<div class="chart" style="display: flex; max-width: 1120px">
  <div style="flex: 0 0 270px; width:270px;">
    <div style="height: 50px;">
      
      <!-- Deprecated scenario dropdown selector. -->
      {#if display_scenario_dropdown}
        <div class="legendtext" style="font-size: 14px; line-height:16px; font-weight: bold; color: #777;">
          Select scenario and model:
        </div>
        <select id="model-selection" bind:value={selectedModel}>
          <option value={MODEL_GOH} >Finland | Goh's SEIR ODE (live)</option>
          <option value={MODEL_CUSTOM} disabled={customScenarioGUID ? false : true} >Custom scenario (precomputed)</option>
        </select>
      {/if}

    </div>

    <!-- ChartCompanion (Resultado del Escenario and highlighted day, left side of chart). -->
    <div style="position:relative; top:100px; right:-115px">
      <ChartCompanion bind:stateMeta = {stateMeta}
        N = {N}
        dt = {dt}
        P_all = {P_all}
        P_bars = {P_bars}
        active_ = {active_}
        indexToTime = {indexToTime}
        firstBarDate = {firstBarDate}
        peakICUDay = {peakICUDay}
        peakICUCount = {peakICUCount}
      />

    </div>
  </div>

  <div style="flex: 0 0 890px; width:890px; height: {height+128}px; position:relative;">

    <!-- Flash message to help the user understand why some action was not possible. -->
    <div on:click={() => {flashMessage = ''}} style="position: absolute;
                left: 400px;
                top: -70px;
                width: 700px;
                cursor: pointer;
                color: #f0027f;
                opacity: 0.5;
                visibility: {flashMessage !== '' ? 'visible' : 'hidden'};
                font-size: 16px;
                ">
      <Icon data={exclamationCircle}
        scale=1.5
        style="color: #f0027f; position: absolute; cursor: pointer;"
        />
      <span style="position: absolute; left: 30px; top: 3px;">
        {flashMessage}
      </span>
    </div>

    <div style="position:relative; top:60px; left: 10px" >

      <!-- Big overlay text about "fetching" or "error" when dealing with custom scenarios. -->
      {#if selectedModel === MODEL_CUSTOM && customScenarioStatus !== ''}
        <div style="position: absolute; top: 100px; left: 100px; font-size: 40px;">
          {customScenarioStatus}
        </div>
      {/if}

      <!-- The actual chart with bars and stuff. -->
      <Chart bind:active={active}
        states = {P_bars} 
        stateMeta = {stateMeta}
        xmax = {Xmax}
        timestep={timestep}
        tmax={tmax}
        N={N}
        ymax={lock ? Plock: Pmax}
        selectedModel={selectedModel}
        icuCapacity={icuCapacity}
        log={!log}
        firstBarDate = {firstBarDate}
        />

      <!-- Buttons on thee right side of chart: zoom and add. -->
      <div>
        {#if selectedModel === MODEL_GOH}
        <div on:click={addActionMarker} title="Add new action marker">
          <Icon data={plus}
            scale=2.5
            class="clickableIcons"
            style="color: #CCC; position: absolute; right: 70px; top: 20px;"
            />
        </div>
        {/if}
        <div on:click={toggleZoomStates} title="Zoom">
          <Icon data={search}
            scale=2.5
            class="clickableIcons"
            style="color: #CCC; position: absolute; right: 70px; bottom: 0px;"
            />
        </div>
      </div>
    </div>

    <!-- Y axis zoom. -->
    <div id="yAxisDrag"
          style="cursor:row-resize;
                pointer-events: all;
                position: absolute;
                top:{55}px;
                left:{0}px;
                width:{20}px;
                background-color:#222;
                opacity: 0;
                height:425px;">
    </div>

    <!-- History Marker. -->
    {#if cutoffHistoricDay < tmax}
      <HistoryMarker
        width = {width}
        height = {height}
        R0 = {R0}
        tmax = {tmax}
        Pmax = {Pmax}
        lastHistoricDay = {lastHistoricDay}
        bind:cutoffHistoricDay = {cutoffHistoricDay}
        bind:Plock = {Plock}
        bind:lock = {lock}
        bind:lock_yaxis = {lock_yaxis}
        bind:flashMessage = {flashMessage}
      />
    {/if}

    <!-- Action Markers. -->
    {#each actionMarkers[selectedModel] as actionMarkerData}
      {#if actionMarkerData[AM_DAY] < tmax}
        <ActionMarker
          width = {width}
          height = {height}
          R0 = {R0}
          tmax = {tmax}
          Pmax = {Pmax}
          P_all_historical = {P_all_historical}
          firstBarDate = {firstBarDate}
          bind:allActiveActionMarkers = {actionMarkers[selectedModel]}
          bind:actionMarkerData = {actionMarkerData}
          bind:Plock = {Plock}
          bind:lock = {lock}
          bind:lock_yaxis = {lock_yaxis}
          bind:flashMessage = {flashMessage}
        />
      {/if}
    {/each}

    <!-- Milestones -->
    <div style="pointer-events: none;
                position: absolute;
                top:{height+84}px;
                left:{0}px;
                width:{780}px;
                opacity: 1.0;
                height:25px;
                cursor:col-resize">
          {#each milestones as milestone}
            <div style="position:absolute; left: {xScaleTime(milestone[0])+8}px; top: -30px;">
              <span style="opacity: 0.3"><Arrow height=30 arrowhead="#circle" dasharray = "2 1"/></span>
                <div class="tick" style="position: relative; left: 0px; top: 35px; max-width: 130px; color: #BBB; background-color: white; padding-left: 4px; padding-right: 4px">{@html milestone[1]}</div>
            </div>
          {/each}
    </div>

   </div>

</div>

<p class="center">
  <b>Configuración de Parametros</b>
</p>

<!-- Large popup when user clicks a question mark icon. -->
{#if popupHTML !== ''}
  <div class="center" style="padding-bottom: 0px;">
    <div style="position: absolute; width: 950px; background-color: white; border: 1px solid #CCC; border-radius: 5px; z-index: 999999;">
      <div on:click={closePopup} title="Close">
        <Icon data={times}
          scale=3
          class="clickableIcons"
          style="color: #CCC; position: absolute; right: 20px; top: 20px;"
          />
      </div>
      <div style="position: relative;
                  top: 20px;
                  padding-bottom: 20px;
                  left: 50px;
                  width: 85%;
                  font-weight: 300;
                  color:#666;
                  font-size: 16.5px;
                  text-align: justify;
                  line-height: 24px">
        {@html popupHTML}
        <button on:click={closePopup} style="color: #666; font-size: 20px; cursor: pointer; padding: 10px; background: none; border: 1px solid #CCC;"><b>OK</b></button>
        <br><br>
      </div>
    </div>
  </div>
{/if}

<!-- Parameter Knobs -->
<div style="padding-bottom: 10px;">
  
  <div class="row">

    {#if selectedModel === MODEL_GOH}

      <div class="column" style="margin-left: 0;">
        <ParameterKnob p = {paramConfigR0} bind:value = {R0} bind:popupHTML = {popupHTML} />
        <div class="paneltext paneldesc"><i>Notar que este número es afectado por los marcadores de acción (Las lineas verticales en el cuadro).</i></div>
      </div>
      <div class="column">
        <ParameterKnob p = {paramConfig["undetected_infections"]} bind:value = {undetected_infections} bind:popupHTML = {popupHTML} />
        <ParameterKnob p = {paramConfig["unrecorded_deaths"]} bind:value = {unrecorded_deaths} bind:popupHTML = {popupHTML} />
      </div>
      <div class="column">
        <ParameterKnob p = {paramConfig["days_from_incubation_to_infectious"]} bind:value = {D_incbation} bind:popupHTML = {popupHTML} />
        <ParameterKnob p = {paramConfig["days_from_infectious_to_not_infectious"]} bind:value = {D_infectious} bind:popupHTML = {popupHTML} />
      </div>
      <div class="column">
        <ParameterKnob p = {paramConfig["days_in_hospital"]} bind:value = {D_hospital} bind:popupHTML = {popupHTML} />
        <ParameterKnob p = {paramConfig["days_in_mild_recovering_state"]} bind:value = {D_recovery_mild} bind:popupHTML = {popupHTML} />
      </div>
      <div class="column">
        <ParameterKnob p = {paramConfig["hospitalization_rate"]} bind:value = {P_SEVERE} specialCaseAddToDisplayValue = {CFR} bind:popupHTML = {popupHTML} />
        <ParameterKnob p = {paramConfig["fatality_rate"]} bind:value = {CFR} bind:popupHTML = {popupHTML} />
      </div>
      <div class="column">
        <ParameterKnob p = {paramConfig["icu_rate_from_hospitalized"]} bind:value = {P_ICU} bind:popupHTML = {popupHTML} />
        <ParameterKnob p = {paramConfig["icu_capacity"]} bind:value = {icuCapacity} bind:popupHTML = {popupHTML} />
      </div>

    {/if}

    {#if selectedModel !== MODEL_GOH}
      <div>
        <p style="white-space: pre-wrap; color: #777; line-height: 17px;">{@html JSON.stringify(custom_params, null, 4)}</p>
      </div>
    {/if}
    
  </div>

  <Collapsible title="Attribution" bind:collapsed={collapsed} defaultCollapsed={false}> 
    <div>
      {@html replaceFuturiceFromTextWithLogo(oneLineAttribution)}
    </div>
    <div>
      For any enquiries, contact Atte Juvonen at futurice.com.
    </div>
    <div>
      <a href="https://github.com/futurice/corona-simulations">Source code available on GitHub.</a>
    </div>
  </Collapsible>

</div>

