import type { Scene } from './scene'

// Stand-ins until the starter scenes land (they will not be loaded from here).
export const fixtureScenes: Scene[] = [
  {
    id: 'family-dinner',
    title: 'Family dinner',
    roles: [
      { id: 'mom', name: 'Mom' },
      { id: 'kid', name: 'Kid' },
    ],
    lines: [
      {
        roleId: 'mom',
        words: [
          { hanzi: '你', pinyin: 'nǐ' },
          { hanzi: '吃饭', pinyin: 'chīfàn' },
          { hanzi: '了', pinyin: 'le' },
          { hanzi: '吗？', pinyin: 'ma' },
        ],
        english: 'Have you eaten?',
      },
      {
        roleId: 'kid',
        words: [
          { hanzi: '吃', pinyin: 'chī' },
          { hanzi: '了，', pinyin: 'le' },
          { hanzi: '妈妈。', pinyin: 'māma' },
        ],
        english: 'I ate, Mom.',
      },
      {
        roleId: 'mom',
        words: [
          { hanzi: '你', pinyin: 'nǐ' },
          { hanzi: '有', pinyin: 'yǒu' },
          { hanzi: '女朋友', pinyin: 'nǚpéngyou' },
          { hanzi: '了', pinyin: 'le' },
          { hanzi: '吗？', pinyin: 'ma' },
        ],
        english: 'Do you have a girlfriend yet?',
      },
      {
        roleId: 'kid',
        words: [
          { hanzi: '我', pinyin: 'wǒ' },
          { hanzi: '吃饱', pinyin: 'chībǎo' },
          { hanzi: '了。', pinyin: 'le' },
        ],
        english: 'I am full.',
      },
    ],
  },
  {
    id: 'taxi',
    title: 'Taxi',
    roles: [
      { id: 'passenger', name: 'Passenger' },
      { id: 'driver', name: 'Driver' },
    ],
    lines: [
      {
        roleId: 'passenger',
        words: [
          { hanzi: '师傅，', pinyin: 'shīfu' },
          { hanzi: '去', pinyin: 'qù' },
          { hanzi: '机场。', pinyin: 'jīchǎng' },
        ],
        english: 'Driver, to the airport please.',
      },
      {
        roleId: 'driver',
        words: [
          { hanzi: '好，', pinyin: 'hǎo' },
          { hanzi: '你', pinyin: 'nǐ' },
          { hanzi: '赶时间', pinyin: 'gǎn shíjiān' },
          { hanzi: '吗？', pinyin: 'ma' },
        ],
        english: 'OK. Are you in a hurry?',
      },
      {
        roleId: 'passenger',
        words: [
          { hanzi: '对，', pinyin: 'duì' },
          { hanzi: '我', pinyin: 'wǒ' },
          { hanzi: '迟到', pinyin: 'chídào' },
          { hanzi: '了。', pinyin: 'le' },
        ],
        english: 'Yes, I am late.',
      },
    ],
  },
]
