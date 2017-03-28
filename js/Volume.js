const cp = require('child_process'),
      Path = require('path'),
      fs = require('fs'),
      Util = require('./Util'),
      Item = require('./Item');

class Volume extends Item {
  constructor(server, id)
  {
    super(server, id);

    this.zpath = `${this.path}/vol/${id}`;
  }

  create()
  {
    const opt = {
      created: Math.floor(+new Date() / 1000),
    };

    cp.execSync(`zfs create ${Util.fmtOptions(opt)} ${this.zpath}`);

    this.server.storage.invalidateProps();
  }

  rename(name)
  {
    cp.execSync(`zfs set shmocker:name=${Util.escapeshellarg(name)} ${this.zpath}`);

    this.server.storage.invalidateProps();
  }

  remove()
  {
    cp.execSync(`zfs set shmocker:remove=1 ${this.zpath}`);

    this.server.storage.invalidateProps();

    this.server.storage.removePurged();
  }

  load()
  {
    this.removed  = (this.prop("shmocker:remove") == "1");
    this.name    = this.prop("shmocker:name");
    this.created = this.prop("shmocker:created");
    this.driver  = "local";
  }
}

module.exports = Volume;