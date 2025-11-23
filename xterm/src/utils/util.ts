// detect type
const toRawType = (value: unknown) => Object.prototype.toString.call(value)

export const isNil = (val: unknown) => {
  return val == null
}

export const isUnEmptyString = (val: unknown) => {
  return !isNil(val) && `${val}` !== ''
}

export const isFunction = (val: unknown) => {
  return toRawType(val) === 'Function'
}
