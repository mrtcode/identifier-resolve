const elasticsearch = require('elasticsearch');
const resolve = require('./resolve');

const client = new elasticsearch.Client({
	hosts: process.env.ES_HOSTS.split(',')
});

exports.handler = async function (event) {
	let item = null;
	
	try {
		item = JSON.parse(event.body);
	} catch(e) {
	
	}
	
	if (!item) {
		return {
			statusCode: 400,
			headers: {
				'Content-Type' : 'text/plain'
			},
			body: 'Invalid item JSON'
		};
	}
	let result = await resolve(client, item);
	return {
		statusCode: 200,
		headers: {
			"Content-Type" : "application/json"
		},
		body: JSON.stringify(result)
	};
};
