fis3-preprocessor-html-inline
===============
简易html资源动态引入处理，支持引入参数替换变量

index.html
```
<link rel="import" href="test.html?__inline&test=123">
```

test.html
```
test: #{test}
```

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

- `ld`: 语法标签（左），默认为 `#{`
- `rd`: 语法标签（右），默认为 `}`
