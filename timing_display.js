const parseTime = d3.utcParse('%m-%d-%Y %H:%M'),
	parseTimeOldFormat = d3.utcParse('%Y-%m-%d %H:%M:%S.%f'),
	parseTimeNewFormat = d3.utcParse('%Y-%m-%d %H:%M'),
	formatTime = d3.utcFormat('%Y-%m-%d %H:%M'),
	formatLatency = d3.format('.2f');

const MAX_LATENCY = 30;

function nestData (data) {
	/* Nests the data under the timestamp, so that each object in the list has a key: datetime value and value: map, where the inner map contains an observation for each scope,inst combination  */
	return d3.nest()
            .key( (d) => {
				return parseTime(d.timestamp);
            })
            .sortKeys( (a, b) => {
            	return new Date(a) - new Date(b); // Seems like the d.nest.key function by default coerces to a string. 
            })
            .rollup( (leaves) => {
            	return d3.nest(leaves) // nested nest to create a map as the second level, instead of an array
               			.key(l => `${l.scope}_${l.inst}`) // Using the map function, coerce to string as key
		       			.map(leaves);
			})
			.entries(data); // the outer array
}

function lineFactory (xFunc, yFunc, innerKey) {
	/* xFunc and yFunc should be d3 scale functions, where x is a datetime scale and y a linear scale. Assumes the function returned will be used to create a path from an array of objects, each object with properties: key=timestamp and value=map(...). The keys of the *inner* map correspond to [scope, institution] pairs. The innerKey argument should be one such array (pair). */

	return d3.line()
           		.defined(function(d) { 
           			return d.value.get(innerKey); // accounting for missing data 
           		})
           		.x(function (d) { 
                	return xFunc(new Date(d.key));
            	})
          		.y(function (d) {
          			// Should be only one element in each array associated with each scope-institution pair for a given timestamp
	                let event = d.value.get(innerKey);
	 				return yFunc(+event[0].mean_latency); // use the mean latency value for y 
	                
    	        });
}

function setupChart(data) {
	// Creates a line for each unique pair -- inst, scope -- in the data

	let nestedData = nestData(data);

	let margin = {top: 20, right: 20, bottom: 75, left: 120},
    	width = 1200 - margin.left - margin.right,
    	height = 600 - margin.top - margin.bottom;

	//latency = Y axis
	let y = d3.scaleLinear()
    		.range([height, 0]);

	//date of event on the X
	let x = d3.scaleTime()
    		.range([0, width]);

	//initiatilze axes with d3 helper functions
	let yAxisFunc = d3.axisLeft(y);

	let xAxisFunc = d3.axisBottom(x);

	let lineMap = makeLineMap(x, y, data);

	let colorScale = d3.scaleOrdinal()
						.domain(lineMap.keys())
						.range(d3.schemeSet3);

	// add the SVG element and axes
	let chart = d3.select('#chart').append('svg')
    			.attr('width', width + margin.left + margin.right)
    			.attr('height', height + margin.top + margin.bottom)
    			.append('g')
    			.attr('class', 'chart')
    			.attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

	chart.append('g')
        .attr('class', 'yaxis');

	chart.append('g')
        .attr('class', 'xaxis')
        .attr('transform', 'translate(0,' + height  + ')');

	return [nestedData, x, y, yAxisFunc, xAxisFunc, lineMap, colorScale];

}

function makeChartTitle([startDate, endDate]) {
	// add a page title
	d3.select('#title')
		.attr('class', 'title')
		.append('h2')
		.text(`Primo Search Latency: ${formatTime(startDate)} to ${formatTime(endDate)}`);
}


function drawAxes(x, y, yAxisFunc, xAxisFunc, dateRange, maxLatency) {
	/*Draws the x and y axes. Accepts the d3 x and y scale functions (x is time series, y is linear float), as well as the d3 axis functions and range endpoints. Assumes the axis elements have already been created as 'g' elements on the SVG space. dateRange should be an array of two Date objects. maxLatency should be a float.*/
	y.domain([0, maxLatency]);
	
	d3.select('.yaxis').call(yAxisFunc);

	x.domain(dateRange);

	let X = d3.select('.xaxis').call(xAxisFunc);

	// transform the X axis
	X.selectAll('text')
        .style('text-anchor', 'end')
        .attr('dx', '-.8em')
        .attr('dy', '.15em')
        .attr('transform', 'rotate(-65)');
}

function makeLineMap(xFunc, yFunc, data) {
	/*Map each scope and institution pair to a d3.line function that will use that [scope, institution] pair as the key when drawing a path from the data set.*/
	return data.reduce( (lineMap, d) => {
		let key = `${d.scope}_${d.inst}`;
		if (!lineMap.has(key)) {
			lineMap.set(key, lineFactory(xFunc, yFunc, key));
		}
		return lineMap;
	}, new Map());
	
}

function drawLines(lineMap, data, colorScale) {
	/* Appends path elements created from a data set. The lineMap should have the following structure:
		{[scope, inst]: lineFunc for that scope,inst} */
	for (let [key, value] of lineMap) {

		d3.select('.chart').select(`.${key}`).remove();
		// append the new line of that type
		d3.select('.chart')
			.append('path')
			.attr('class', `line ${key}`)
			.datum(data)
			.attr('d', value) // a d3.line function
			.attr('stroke', colorScale(key));	
	}
	
}
function makeChartKeys(lineMap, colorScale) {
	/*Create checkboxes for the institution/scope pairs, allowing visualization of a subset.*/
	let chartDiv = d3.select('#chart-key')
					.selectAll('input')
					.data(Array.from(lineMap))
					.enter()
					.append('div')

	chartDiv.append('input')
		.attr('type', 'checkbox')
		.attr('name', (d) => d[0])
		.attr('class', (d) => `checkbox ${d[0]}`) 
		.attr('checked', true)
		.on('change', function (d) {
			// on change of the checkbox, toggle the visibility of this visual element on the chart
			let checkbox = d3.select(this); // get the checkbox element
			d3.select(`.line.${d[0]}`)
				.style('visibility', (d) => {
					if (checkbox.property('checked')) {
						return 'visible';
					}
					else {
						return 'hidden';
					}

				});
		});

	chartDiv.append('label')
		.append('label')
		.attr('for', (d) => d[0])
		.text((d) => d[0])
		.on("mouseover", (d)=> {
			// select all lines in the chart except the one matching the label currently being moused over 
			d3.selectAll(`.line:not(.${d[0]})`)
				/*.filter(function (dd) {
					return d3.select(`.checkbox.${}`).property('checked'); // filter out those that have been disabled 
				})*/
				.style('visibility', 'hidden');  // hide the matching elements
		})
		.on("mouseout", (d) => {
			d3.selectAll(`.line:not(.${d[0]})`)
				/*.filter(function (dd) {
					return d3.selectAll(`.checkbox`).property('checked');
				})*/
				.style('visibility', 'visible');  // reveal the matching elements
		});

}

function makeChart(chartArgs) {
	/* (Re)draws the chart with new data. Assumes data is a key-sorted nested object (from d3.nest.entries (see above).  */
	
	let [nestedData, x, y, yAxisFunc, xAxisFunc, lineMap, colorScale] = chartArgs,
		dateRange = [new Date(nestedData[0].key), new Date(nestedData[nestedData.length-1].key)],
		maxLatency = MAX_LATENCY; // Use a fixed value for this, since Primo times out after 30 seconds.
	
	drawAxes(x, y, yAxisFunc, xAxisFunc, dateRange, maxLatency);

	drawLines(lineMap, nestedData, colorScale);

	makeChartTitle(dateRange);
	makeChartKeys(lineMap, colorScale);

}

function processData(data) {
	/* 
	Sorts the dates as strings to avoid weird JS date problems (with time zones); converts the latency to a more readable numeric format
  */
  	
  	return data.map( d => {
  		let timestamp = parseTime(d.timestamp) ? parseTime(d.timestamp) : parseTimeOldFormat(d.timestamp);
  		d.timestamp = formatTime(timestamp);
  		d.max_latency = formatLatency(d.max_latency);
  		d.mean_latency = formatLatency(d.mean_latency)
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

function staggerTestData(data) {
	/*Function for testing. Takes timestamp data that might be too close together to render well and spaces it out. Argument should be an array of objects, where each object has a property called 'key,' whose value is a valid timestamp.*/
	return data.reduce( (prev, curr, i) => {
		let oldDate = new Date(curr.key),
			newDate = oldDate.setDate(oldDate.getDate() + i + 1); // add a day to each date
		curr.key = new Date(newDate);
		prev.push(curr);
		return prev;
	}, []);
}

function showLogAsTable(data, columns) {
	let table = d3.select('.table') 
	console.log(data)
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
		.attr('class', d => (d.mean_latency < 5) ? 'normal' : 'alert')
		.selectAll('td')
		.data(d => columns.map(c => d[c]))
		.enter()
		.append('td')
		.text(d => d);
}

d3.csv('./data/primo_timing.csv')
	.then(data => {
		let chartArgs = setupChart(data);
		makeChart(chartArgs);
		// Draw the table
		showLogAsTable(processData(data), data.columns);
	})
	.catch(e => console.log(e));