export const STORAGE_KEY = 'epubtyper-state-v3';
export const HISTORY_LIMIT = 200;
export const BOOK_PALETTE = ['#e9785d', '#2f6f7e', '#c4a35a', '#5b8a7a', '#6b7cb4', '#b85c8a', '#d4894a', '#17223b'];
export const CHARS_PER_WORD = 5;
export const MAX_KEY_GAP_MS = 2000;
export const SAME_MS_KEY_DELAY = 80;
export const WPM_EMA_ALPHA = 0.2;
export const COMMON_CHARSET = [
  'abcdefghijklmnopqrstuvwxyz',
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  '0123456789',
  " !\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~"
].join('');
export const MIN_CHAPTER_CHARACTERS = 80;
export const MAX_CHAPTER_CHARACTERS = 20000;
export const CHARSET_PRESETS = {
  qwerty: COMMON_CHARSET,
  azerty: `${COMMON_CHARSET}àâäæçéèêëîïôœöùûüÿÀÂÄÆÇÉÈÊËÎÏÔŒÖÙÛÜŸ`,
  qwertz: `${COMMON_CHARSET}äöüßÄÖÜẞ`,
  spanish: `${COMMON_CHARSET}áéíóúüñÁÉÍÓÚÜÑ¿¡`,
  nordic: `${COMMON_CHARSET}åäöøæÅÄÖØÆ`,
  russian: `${COMMON_CHARSET}йцукенгшщзхъфывапролджэячсмитьбюёЙЦУКЕНГШЩЗХЪФЫВАПРОЛДЖЭЯЧСМИТЬБЮЁ`,
  ukrainian: `${COMMON_CHARSET}йцукенгшщзхїґфівапролджєячсмитьбюЙЦУКЕНГШЩЗХЇҐФІВАПРОЛДЖЄЯЧСМИТЬБЮ`,
  belarusian: `${COMMON_CHARSET}йцукенгшўзхъфывапролджэячсміцьбюЙЦУКЕНГШЎЗХЪФЫВАПРОЛДЖЭЯЧСМІЦЬБЮ`,
  bulgarian: `${COMMON_CHARSET}абвгдежзийклмнопрстуфхцчшщъьюяАБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЬЮЯ`,
  polish: `${COMMON_CHARSET}ąćęłńóśźżĄĆĘŁŃÓŚŹŻ`,
  czechSlovak: `${COMMON_CHARSET}áäčďéěíĺľňóôŕřšťúůýžÁÄČĎÉĚÍĹĽŇÓÔŔŘŠŤÚŮÝŽ`,
  serbian: `${COMMON_CHARSET}абвгдђежзијклљмнњопрстћуфхцчџшАБВГДЂЕЖЗИЈКЛЉМНЊОПРСТЋУФХЦЧЏШ`
};
export const DEFAULT_SETTINGS = {
  remainingColor: '#a9adb4',
  typedColor: '#17223b',
  errorColor: '#e9785d',
  currentBackground: '#f6d8cc',
  charsetPreset: 'qwerty',
  charset: COMMON_CHARSET,
  skipUnicode: true,
  skipWhitespace: true,
  skipRepeatedSpaces: true
};
