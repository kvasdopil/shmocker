class Util {
  static escapeshellarg(arg)
  {
    arg = String(arg).replace(/[^\\]'/g, m =>
      m.slice(0, 1) + '\\\''
    );
    return `"${arg}"`;
  }

  static isDir(path)
  {
    try {
      return fs.lstatSync(path).isDirectory();
    } catch(e) {
      return false;
    }
  }

  static fmtOptions(opt)
  {
    const result = [];

    for(var n in opt)
    {
      const v = opt[n];
      if(typeof v != 'object')
        result.push(`-o ${Util.escapeshellarg(`shmocker:${n}=${v}`)}`);
      else
        for(let i in v)
        {
          const item = v[i];
          result.push(`-o ${Util.escapeshellarg(`shmocker:${n}:${i}=${item}`)}`);
        }
    }

    return result.join(" ");
  }
}

module.exports = Util;