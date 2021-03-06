## 介绍
简易html资源动态引入处理，支持引入参数替换变量，支持自定义模板渲染引擎

## 使用
```
npm install fis3-preprocessor-html-inline
```

```js
fis.match('*.html', {
	preprocessor: fis.plugin('html-inline')
})
```

## 参数说明
- `compile`: `null` 自定义模板渲染引擎，为`null`则使用简易变量替换，配合下方参数使用
- `ld`: `{{` 语法标签（左）
- `rd`: `}}` 语法标签（右）
- `removeEmpty`: `true` 是否删除无数据变量

## 自定义模板渲染引擎

以`art-template`为例：
```js
const template = require('art-template');
fis.match('*.html', {
	preprocessor: fis.plugin('html-inline', {
		compile(target, tpl, data) {
			const id = target.moduleId
			if(!template.cache[id] || !target.useCache || template.cache[id + '.cache']!= target.cache.timestamp) {
				template.compile(tpl, {
					filename: id
				})
				template.cache[id + '.cache'] = target.useCache ? target.cache.timestamp : +new Date()
			}

			return template(id, data)
		}
	})
})
```

> 暂不支持 art-template的include语法

## 参数数据载入规则

### query载入变量
index.html
```html
<link rel="import" href="test.html?__inline&test=123&user[0]=东东&user[1]=丽丽">
```

test.html
```html
test: {{test}}
user: {{user}}
user0: {{user[0]}}
```

结果
```html
test: 123
user: 东东,丽丽
user0: 东东
```

参数支持如下（由loader-utils修改而来）：
```
                             -> Error
?                            -> {}
?flag                        -> { flag: "" }
?+flag                       -> { flag: true }
?-flag                       -> { flag: false }
?xyz=test                    -> { xyz: "test" }
?xyz=1                       -> { xyz: "1" } // numbers are NOT parsed
?flag1&flag2                 -> { flag1: "", flag2: "" }
?+flag1&-flag2               -> { flag1: true, flag2: false }
?flag1=true&flag2=false      -> { flag1: true, flag2: false }
?xyz[]=a                     -> { xyz: ["a"] }
?xyz[]=a&xyz[]=b             -> { xyz: ["a", "b"] }
?xyz[]=a&xyz[]=b&xyz[3]=d    -> { xyz: ["a", "b", , "d"] }
?a%2C%26b=c%2C%26d           -> { "a,&b": "c,&d" }
?{data:{a:1},isJSON5:true}   -> { data: { a: 1 }, isJSON5: true }
```

### __inline载入变量
index.html
```html
<link rel="import" href="user.html?__inline={name: '丽丽', age: 18}">
```

user.html
```html
<p>你好 {{name}}，你今年<em>{{age}}</em>岁咯！加油！</p>
```

结果
```html
<p>你好 丽丽，你今年<em>18</em>岁咯！加油！</p>
```

### __inline载入json


```html
<link rel="import" href="user.html?__inline=user.json">
```

user.html
```html
<p>你好 {{name}}，你今年<em>{{age}}</em>岁咯！加油！</p>
```

user.json
```json
{
    "name": "丽丽",
    "age": 18
}
```

结果
```html
<p>你好 丽丽，你今年<em>18</em>岁咯！加油！</p>
```

> json文件路径查找顺序：当前文件、模板文件

### 无参数编译
默认无任何参数的情况下，本插件是不介入编译的，但是部分引入的页面不需要变量，而且引入的页面模板上又设置了变量，此时`__inline=true`就能启动本插件进行编译
```html
<link rel="import" href="user.html?__inline=true">
```
