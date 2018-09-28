var lang = fis.compile.lang;
var fs = require('fs');
var reg = /<!--\s*inline\[([^\]]+)\]\s*-->|<!--([\s\S]*?)-->|<link\s+([\s\S]*?["'\s\w\/\-])(?:>|$)/ig,
	rRel = /\srel\s*=\s*('[^']+'|"[^"]+"|[^\s\/>]+)/i,
	rHref = /(\s(?:data-)?href\s*=\s*)('[^']+'|"[^"]+"|[^\s\/>]+)/i,
	rQuote = /^['"]|['"]$/g,
	rRegCover = /([$*+.?\\^|()[\]{}])/g;

/**
 * url参数转换为Object
 *
 * @param {String} query 需要解析的query
 * @returns {Object}
 */
var paramAryReg = /(.*?)\[(\d+)\]/;
function parseQuery(query) {
	let params = {}

	if(!query) return params

	query = query.substring(query.indexOf('?') + 1)
	var queryAry = query.split('&')

	queryAry.forEach(item => {
		let param = item.split('=')
		if(!param[0]) return

		param[1] = decodeURIComponent(param[1])
		var aryMatch = param[0].match(paramAryReg)
		if (aryMatch) {
			if (typeof params[aryMatch[1]] == 'undefined') {
				params[aryMatch[1]] = []
			}
			params[aryMatch[1]][aryMatch[2]] = param[1]
		} else {
			if (params[param[0]]) {
				params[param[0]] = params[param[0]] + ',' + param[1]
			} else {
				params[param[0]] = param[1]
			}
		}
	})

	return params
}

/**
 * 判断info.query是否为inline
 *
 * - `abc?__inline` return true
 * - `abc?__inlinee` return false
 * - `abc?a=1&__inline'` return true
 * - `abc?a=1&__inline=` return true
 * - `abc?a=1&__inline&` return true
 * - `abc?a=1&__inline` return true
 * @param {Object} info
 * @memberOf fis.compile
 */
function isInline(info) {
	return /[?&]__inline(?:[=&'"]|$)/.test(info.query);
}

module.exports = function(content, file, options) {
	// 只对 html 类文件进行处理
	if (!file.isHtmlLike){
		return content;
	}

	var regStr = options.ld.replace(rRegCover, '\\$1') + '(\\w+?)' + options.rd.replace(rRegCover, '\\$1')
	var rContent = new RegExp(regStr, 'g')

	var res = content.replace(reg, (m, commentInline, comment, link) => {
		if (!commentInline && !link) return m;

		var path = ''
		// <!--inline[]-->
		if(commentInline) {
			path = commentInline
		}else if(link) {
			// <link rel="import|stylesheet">
			var result = m.match(rRel);
			if (result && result[1]) {
				var rel = result[1].replace(rQuote, '').toLowerCase();
				if(rel !== 'import' && rel !== 'stylesheet') return m
			}

			var pathMatch = m.match(rHref);
			if(pathMatch && pathMatch[2]) {
				path = pathMatch[2].replace(rQuote, '')
			}
		}

		var queryInfo = fis.util.query(path)
		if(!isInline(queryInfo)) return m
		var query = queryInfo.query.replace('__inline', '')
		var params = parseQuery(query)
		if(JSON.stringify(params)=='{}') return m

		var info = fis.project.lookup(path, file);
		var target = info.file;
		if(!target.isText()) return m

		fis.compile(target);
		var inlineContent = target.getContent().replace(rContent, (m, key) => {
			return params[key] ? params[key] : m
		})

		return inlineContent;
	})

 	return res
};


module.exports.defaultOptions = {
	ld: '#{',
	rd: '}'
}
