const parseTime = d3.utcParse("%m-%d-%Y %H:%M"),
	parseTimeOldFormat = d3.utcParse("%Y-%m-%d %H:%M:%S.%f"),
	parseTimeNewFormat = d3.utcParse('%Y-%m-%d %H:%M'),
	formatTime = d3.utcFormat("%Y-%m-%d %H:%M"),
	formatLatency = d3.format('.2f');

// line factory for creating d3.line functions 
function lineFactory (xFunc, yFunc, valueKey) {
	/* xFunc and yFunc should be d3 scale functions, where x is a datetime scale and y a linear scale. Assumes the function returned will be used to create a path from an array of objects, where each object has this structure -- as created by d3.nest.entries -- with one or more key-value pairs nested under the "value" key: 			
				{key: date,
				value: {valueKey1: ...,
						valueKey2: ...}}  */

	return d3.line()
           		.x(function (d) { 
           			//console.log(`${new Date(d.key)}: ${xFunc(new Date(d.key))}`)
                	return xFunc(new Date(d.key));
            	})
          		.y(function (d) {
	                //console.log(`${d.value[valueKey]}: ${yFunc(d.value[valueKey])}`);
	                if (d.value[valueKey]) return yFunc(d.value[valueKey]);
    	        });
}

function setupChart(scopes) {
	// Accepts an array of Primo scopes, creating a line for each

	var margin = {top: 20, right: 20, bottom: 75, left: 120},
    	width = 800 - margin.left - margin.right,
    	height = 500 - margin.top - margin.bottom;



	//amount = Y axis
	var y = d3.scaleLinear()
    		.range([height, 0]);

	//date of transaction (actual or expected) on the X
	var x = d3.scaleTime()
    		.range([0, width]);

	//initiatilze axes with d3 helper functions
	var yAxisFunc = d3.axisLeft(y)
				.tickSizeInner(-width);

	var xAxisFunc = d3.axisBottom(x);

	// create an object holding a d3.line generator for each scope
	var linesObj = scopes.reduce( (prev, curr) => {
		prev[curr] = lineFactory(x, y, curr);
		return prev;
	}, {});

	// add the SVG element and axes
	var chart = d3.select("#chart").append("svg")
    			.attr("width", width + margin.left + margin.right)
    			.attr("height", height + margin.top + margin.bottom)
    			.append("g")
    			.attr("class", "chart")
    			.attr("transform", "translate(" + margin.left + "," + margin.top + ")");

	chart.append('g')
        .attr('class', 'yaxis');

	chart.append('g')
        .attr('class', 'xaxis')
        .attr('transform', 'translate(0,' + height  + ')');

	return [x, y, yAxisFunc, xAxisFunc, linesObj];

}

function makeChartTitle(n) {
	// add a page title
	d3.select("#title")
		.attr("class", "title")
		.text(`Primo Search Latency: Past ${n} Hours`);
}


function drawAxes(x, y, yAxisFunc, xAxisFunc, dateRange, maxLatency) {
	/*Draws the x and y axes. Accepts the d3 x and y scale functions (x is time series, y is linear float), as well as the d3 axis functions and range endpoints. Assumes the axis elements have already been created as "g" elements on the SVG space. dateRange should be an array of two Date objects. maxLatency should be a float.*/
	y.domain([0, maxLatency]);
	
	d3.select('.yaxis').call(yAxisFunc);

	x.domain(dateRange);

	var X = d3.select(".xaxis").call(xAxisFunc);

	// transform the X axis
	X.selectAll('text')
        .style('text-anchor', 'end')
        .attr('dx', '-.8em')
        .attr('dy', '.15em')
        .attr('transform', 'rotate(-65)');
}


function makeChart(data, allocation, fiscalDates, chartArgs) {
	/* (Re)draws the chart with new data. Assumes data is a key-sorted nested object (from d3.nest.entries (see above). fiscalDates should be a 2-element array of  date objects, and allocation a float. chartArgs are returned by the setupChart function. */
	
	let [x, y, yAxisFunc, xAxisFunc, linesObj] = chartArgs;
	
	drawAxes(x, y, yAxisFunc, xAxisFunc, fiscalDates, allocation);

	drawLines(linesObj, data);

}

function processData(data) {
	/* 
	Sorts the dates as strings to avoid weird JS date problems (with time zones); converts the latency to a more readable numeric format
  */
  	
  	return data.map( d => {
  		let timestamp = parseTime(d.timestamp) ? parseTime(d.timestamp) : parseTimeOldFormat(d.timestamp);
  		d.timestamp = formatTime(timestamp);
  		d.latency = formatLatency(d.latency);
  		return d;
  	})
  	.sort((a, b) => {
  		return b.timestamp <= a.timestamp ? -1 : 1;
  	})
  	.filter(d => {
  		// filter and return only those logs within the last 40 hours
  		timestamp = parseTimeNewFormat(d.timestamp);
  		// math to convert the millisecond time delta to a difference of hours
  		return (new Date() - timestamp) / 1000 / 60 / 60 <= 48;
  	})

}

function showLogAsTable(data, columns) {
	let table = d3.select('.table') 

	// Create the table header
	table.select('thead tr')
		.selectAll('td')
		.data(columns)
		.enter()
		.append('td')
		.text(d => d)
	// Populate the rows
	table.select('tbody')
		.selectAll('tr')
		.data(data)
		.enter()
		.append('tr')
		.attr('class', d => (d.latency < 5) ? 'normal' : 'alert')
		.selectAll('td')
		.data(d => columns.map(c => d[c]))
		.enter()
		.append('td')
		.text(d => d);
}

d3.csv('./primo_timing.csv')
	.then(data => {
		showLogAsTable(processData(data), data.columns);
	})
	.catch(e => console.log(e));