const extend = require('extend'),
	parseQuery = require('./parseQuery')

const reg = /<!--\s*inline\[([^\]]+)\]\s*-->|<!--([\s\S]*?)-->|<link\s+([\s\S]*?["'\s\w\/\-])(?:>|$)/ig,
	rRel = /\srel\s*=\s*('[^']+'|"[^"]+"|[^\s\/>]+)/i,
	rHref = /(\s(?:data-)?href\s*=\s*)('[^']+'|"[^"]+"|[^\s\/>]+)/i,
	rQuote = /^['"]|['"]$/g,
	rLinkEnd = /\/(?=>$)/,
	rLinkAttr = /\s+(?:charset|href|data-href|hreflang|rel|rev|sizes|target)\s*=\s*(?:'[^']+'|"[^"]+"|[^\s\/>]+)/ig,
	rRegCover = /([$*+.?\\^|()[\]{}])/g,
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
 * 读取json文件
 *
 * @param {Object} params query参数，只处理__inline为json文件路径情况
 * @param {fis.FILE} file 当前文件对象，用于查找json文件
 * @param {fis.FILE} target 目标文件对象，用于查找json文件
 * @returns {Object}
 */
function readJsonFile(params, file, target) {
	let inlineData = {},
		inlineValue = params['__inline'];

	delete params['__inline']
	if(inlineValue) {
		if(typeof inlineValue=='object') {
			inlineData = inlineValue
		}else if(typeof inlineValue=='string' && rJSONFile.test(inlineValue)) {
		// 尝试从当前文件下、目标文件下查找json文件数据源
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
		let val = eval(`data['${key}']${path ? path : ''}`),
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
		const pathQuery = fis.util.query(path).query
		if(!pathQuery) return m
		const query = parseQuery(pathQuery)
		if(Object.keys(query).length<=1 && !query['__inline']) return m

		// 获取目标文件对象
		const target = fis.project.lookup(path, file).file;
		if(!target || !target.isFile() || !target.isText()) return m

		// 尝试读取json文件
		const params = readJsonFile(query, file, target)

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
