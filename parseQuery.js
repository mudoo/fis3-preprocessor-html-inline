"use strict";

const JSON5 = require("json5");

const specialValues = {
	"null": null,
	"true": true,
	"false": false
};

const rJSON = /^[{[\]]/;
const aryReg = /(.*?)\[(\d+)?\]$/;

function parseQuery(query) {
	if(query.substr(0, 1) !== "?") {
		throw new Error("A valid query string passed to parseQuery should begin with '?'");
	}
	query = query.substr(1);
	if(!query) {
		return {};
	}
	if(query.substr(0, 1) === "{" && query.substr(-1) === "}") {
		return JSON5.parse(query);
	}
	const queryArgs = query.split('&');
	const result = {};
	queryArgs.forEach(arg => {
		const idx = arg.indexOf("=");
		if(idx >= 0) {
			let name = arg.substr(0, idx);
			let value = decodeURIComponent(arg.substr(idx + 1));
			if(specialValues.hasOwnProperty(value)) {
				value = specialValues[value];
			}else if(rJSON.test(value)) {
				value = JSON5.parse(value)
			}

			// Array
			const aryMatch = name.match(aryReg)
			if (aryMatch) {
				name = aryMatch[1];
				let i = aryMatch[2]
				if(!Array.isArray(result[name]))
					result[name] = [];

				if(typeof i == 'undefined') {
					result[name].push(value);
				}else{
					result[name][i] = value;
				}
			} else {
				name = decodeURIComponent(name);
				result[name] = value;
			}
		} else {
			if(arg.substr(0, 1) === "-") {
				result[decodeURIComponent(arg.substr(1))] = false;
			} else if(arg.substr(0, 1) === "+") {
				result[decodeURIComponent(arg.substr(1))] = true;
			} else {
				result[decodeURIComponent(arg)] = '';
			}
		}
	});
	return result;
}

module.exports = parseQuery;
