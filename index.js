const extend = require('extend')
const reg = /<!--\s*inline\[([^\]]+)\]\s*-->|<!--([\s\S]*?)-->|<link\s+([\s\S]*?["'\s\w\/\-])(?:>|$)/ig,
	rRel = /\srel\s*=\s*('[^']+'|"[^"]+"|[^\s\/>]+)/i,
	rHref = /(\s(?:data-)?href\s*=\s*)('[^']+'|"[^"]+"|[^\s\/>]+)/i,
	rQuote = /^['"]|['"]$/g,
	rLinkEnd = /\/(?=>$)/,
	rLinkAttr = /\s+(?:charset|href|data-href|hreflang|rel|rev|sizes|target)\s*=\s*(?:'[^']+'|"[^"]+"|[^\s\/>]+)/ig,
	rRegCover = /([$*+.?\\^|()[\]{}])/g,
	rJSON = /^[{[\]]/,
	rJSONFile = /\.json$/;

/**
 * 验证是否数组
 *
 * @param {Array} arr
 * @return {Boolean}
 */
function isArray(arr) {
	return Object.prototype.toString.apply(arr) === '[object Array]'
}

/**
 * 添加依赖
 *
 * @param {Object} a
 * @param {Object} b
 */
function addDeps(a, b) {
	if (a && a.cache && b) {
		if (b.cache) {
			a.cache.mergeDeps(b.cache);
		}
		a.cache.addDeps(b.realpath || b);
	}
}

/**
 * url参数转换为Object
 *
 * @description 只支持正常参数、数组参数，如：?test=123&opts[0]=a&opts[1]=b
 *
 * @param {String} query 需要解析的query
 * @returns {Object}
 */
const paramAryReg = /(.*?)\[(\d+)\]/;
function parseQuery(query) {
	let params = {}

	if(!query) return params

	query = query.substring(query.indexOf('?') + 1)
	const queryAry = query.split('&')

	queryAry.forEach(item => {
		let param = item.split('=')
		if(!param[0]) return

		param[1] = param[1] ? decodeURIComponent(param[1]) : ''
		const aryMatch = param[0].match(paramAryReg)
		if (aryMatch) {
			if (typeof params[aryMatch[1]] == 'undefined') {
				params[aryMatch[1]] = []
			}
			params[aryMatch[1]][aryMatch[2]] = param[1]
		} else {
			let curParam = params[param[0]]
			params[param[0]] = (curParam ? curParam+',' : '') + param[1]
		}
	})

	return params
}

/**
 * 解析参数
 *
 * @param {Object} params 待处理参数，__inline参数可携带JSON对象、json文件路径
 * @param {fis.FILE} file 当前文件对象，用于查找json文件
 * @param {fis.FILE} target 目标文件对象，用于查找json文件
 * @returns {Object}
 */
function parseParam(params, file, target) {
	let inlineData = {},
		inlineValue = params['__inline'];

	delete params['__inline']

	// __inline=data.json|{"test": 123}
	if(inlineValue && inlineValue!='true') {
		// 尝试解析JSON
		if(rJSON.test(inlineValue)) {
			let tmpData
			// try {
				// tmpData = JSON.parse(inlineValue)
			// }catch(e) {
				// JSON解析失败，尝试使用function返回
				try {
					tmpData = new Function(`return ${inlineValue}`)()
				}catch(e){
					// 并不是个JSON
				}
			// }
			if(typeof tmpData=='object' && tmpData) {
				inlineData = tmpData
			}
		}else if(rJSONFile.test(inlineValue)) {
			// 尝试从当前文件下、目标文件下查找json文件数据源
			// NOTE: 使用lookup api，会触发hook-node_modules文件查找
			// let jsonFile = fis.project.lookup(inlineValue, file).file || fis.project.lookup(inlineValue, target).file
			// let jsonFile = fis.uri(inlineValue, target ? target.dirname : fis.getProjectPath());
			let jsonFile = fis.uri(inlineValue, file.dirname).file || fis.uri(inlineValue, target.dirname).file;
			if(jsonFile) {
				inlineData = fis.util.readJSON(jsonFile.realpath)
			}
		}
	}

	// 如果json是数组，则忽略url带的参数，因为extend后，数组会转换成对象
	return isArray(inlineData) ? inlineData : extend(true, {}, inlineData, params)
}

/**
 * 简易编译，只替换参数变量，不支持其他任何语法
 *
 * @description 姓名：{{name}}，年龄：{{age}}
 *
 * @param {String} content 编译内容
 * @param {*} data 编译数据源
 * @param {*} options 选项
 * @returns
 */
function compileSimple(target, content, data, options) {
	var regStr = options.ld.replace(rRegCover, '\\$1') + '\\s*(\\w+)([[.].*?)?\\s*' + options.rd.replace(rRegCover, '\\$1')
	var rContent = new RegExp(regStr, 'g')

	return content.replace(rContent, (m, key, path) => {
		// let val = new Function(`return this['${key}']${path ? path : ''}`).apply(data),
		let val = eval(`data['${key}']${path ? path : ''}`)
		def = options.removeEmpty ? '' : m

		return val ? val : def
	})
}

function compile(target, content, data, options) {
	var enigen = options.compile || compileSimple

	return enigen.apply(null, arguments)
}

module.exports = function(content, file, options) {
	// 只对 html 类文件进行处理
	if (!file.isHtmlLike){
		return content;
	}

	return content.replace(reg, (m, commentInline, comment, link) => {
		if (!commentInline && !link) return m;

		let path = '',
			isCssLink = false,
			isImportLink = false;

		// <!--inline[]-->
		if(commentInline) {
			path = commentInline
		}else if(link) {
			// <link rel="import|stylesheet">
			const result = m.match(rRel);
			if (result && result[1]) {
				const rel = result[1].replace(rQuote, '').toLowerCase();
				isCssLink = rel === 'stylesheet';
				isImportLink = rel === 'import';

				if(!isCssLink && !isImportLink) return m
			}

			const pathMatch = m.match(rHref);
			if(pathMatch && pathMatch[2]) {
				path = pathMatch[2].replace(rQuote, '')
			}
		}

		// 解析参数，无__inline参数值，且无任何其他参数，不处理
		const query = parseQuery(fis.util.query(path).query)
		if(Object.keys(query).length<=1 && !query['__inline']) return m

		// 获取目标文件对象
		const target = fis.project.lookup(path, file).file;
		if(!target || !target.isFile() || !target.isText()) return m

		// 解析参数
		const params = parseParam(query, file, target)

		// 先编译目标文件（fis.match配置的编译）、加入依赖表
		fis.compile(target);
		file.addLink(target.subpath);
		addDeps(file, target);

		// 二次编译，将参数带到文件里
		let inlineContent = ''
		if (isCssLink) {
			inlineContent += '<style' + m.substring(5).replace(rLinkEnd, '').replace(rLinkAttr, '');
		}
		inlineContent += compile(target, target.getContent(), params, options)
		if (isCssLink) {
			inlineContent += '</style>';
		}

		// return inlineContent || m;
		return inlineContent;
	})
};


module.exports.defaultOptions = {
	// 默认使用自带简易编译，配合ld、rd语法标识参数
	// 这里可以设置为任何模板引擎，自行实现
	compile: null,
	ld: '{{',
	rd: '}}',
	removeEmpty: true
}
