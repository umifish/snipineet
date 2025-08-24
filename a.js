warpTag (content, keyword, tagName) {
    if (content === '') {
      return content
    }
    const a = content.toLowerCase()
    const b = keyword.toLowerCase()
    const indexof = a.indexOf(b)
    const c = indexof > -1 ? content.substr(a.indexOf(b), keyword.length) : ''
    const val = `<${tagName} class='keywords'>${c}</${tagName}>`
    let characterReg = /^.*[\\!~@#$%^&*(_)+\-=`,./<>?;':"|[\]{}].*$/
    let regS
    if (characterReg.test(keyword)) {
      if (keyword.length === 1) {
        regS = new RegExp('\\' + keyword, 'gi')
      } else {
        let keywordNew = ''
        for (let i = 0; i < keyword.length; i++) {
          keywordNew += i < keyword.length - 1 ? keyword.substr(i, 1) + '\\' : keyword.substr(i, 1)
        }
        keyword = keywordNew
      }
      regS = new RegExp('\\' + keyword, 'gi')
    } else {
      regS = new RegExp(keyword, 'gi')
    }
    return content.replace(regS, val)
  }
  