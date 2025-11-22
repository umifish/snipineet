/**
 * 获取数组的切片
 * @param array 源数组
 * @param start 起始索引
 * @param size 切片大小
 * @returns 切片数组
 */
export const sliceArray = <T>(array: T[], start: number, size: number): T[] => {
  return array.slice(start, start + size)
}

