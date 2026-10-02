"""
把文泉驿微米黑收成日语、韩语和西班牙语重音用的 woff2。
黄油体没有这些字。合成字的部件要一起留下，否则韩文会变成方框。
"""
import sys
from fontTools.ttLib import TTFont
from fontTools.subset import Options, Subsetter


def main():
    source, chars_file, out_file = sys.argv[1:]
    chars = open(chars_file, encoding='utf-8').read()
    font = TTFont(source, fontNumber=0)
    options = Options()
    options.flavor = 'woff2'
    options.desubroutinize = True
    options.hinting = False
    options.layout_features = ['*']
    options.name_IDs = ['*']
    options.notdef_outline = True
    subsetter = Subsetter(options=options)
    subsetter.populate(text=chars)
    subsetter.subset(font)
    font.flavor = 'woff2'
    font.save(out_file)


if __name__ == '__main__':
    main()
