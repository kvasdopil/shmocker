const cp = require('child_process'),
      Path = require('path'),
      fs = require('fs'),
      Util = require('./Util'),
      Item = require('./Item');

class Image extends Item {
  constructor(server, id, tag)
  {
    super(server, id);

    tag = tag.split(":", 2);
    if(tag.length < 2)
      tag[1] = false;

    if(tag[0] == "")
      tag[0] = false;

    if(tag[1] == "")
      tag[1] = false;

    this.name = tag[0];
    this.tag = tag[1];

    this.zpath = `${this.path}/images/${id}`;
  }

  untag()
  {
    let tag = this.name;
    if(this.tag != false)
      tag = `${this.name}:${this.tag}`;

    const tags = this.prop("shmocker:tags");
    for(const n in tags)
    {
      if(tag == tags[n])
        cp.execSync(`zfs inherit shmocker:tags:${n} ${this.zpath}`);
    }

    this.server.storage.invalidateProps();
    this.server.storage.removePurged();
  }

  addtag(tag)
  {
    if(! /^[a-zA-Z0-9_.-]+(:[a-zA-Z0-9_.-]+)?/.test(tag))
      return false;

    if(/^[a-zA-Z0-9_.-]+:latest/.test(tag)) // cant add 'latest' tag
      return false;

    const tags = this.prop("shmocker:tags");

    let i = 0;
    while(tags[i])
      i++; // find unique id

    cp.execSync(`zfs set shmocker:tags:${i}=${tag} ${this.zpath}`);

    return true;
  }

  load()
  {
    this.size = parseInt(this.prop("used"));
    this.created = parseInt(this.prop("shmocker:created"));
    this.tags = [];

// fixme
  }

  diff()
  {
    // FIXME: this is ugly, keep that until rewritten into deamon
    const root = this.path;

    const parent = this.getOrigin();

    let diff = [];

    try {
      fs.mkdirSync(this.mountpoint);
    } catch(e) {}

    try{
      fs.mkdirSync(`/mnt/${parent}`);
    } catch(e) {}

    try {
      cp.execSync(`mount -t zfs -oro ${root}/images/${parent} /mnt/${parent}`);
    } catch(e) {}

    try{
      cp.execSync(`mount -t zfs -oro ${this.zpath} ${this.mountpoint}`);
    } catch(e) {}

    try {
      diff = cp.execSync(`zfs diff ${root}/images/${parent}@ok ${root}/images/${id}`).toString().trim().split("\n");
    } catch(e) {}

    try {
      cp.execSync(`umount ${this.mountpoint}`);
    } catch(e) {}

    try {
      cp.execSync(`umount /mnt/${parent}`);
    } catch(e) {}

    try {
      fs.rmdirSync(this.mountpoint);
    } catch(e) {}

    try {
      fs.rmdirSync(`/mnt/${parent}`);
    } catch(e) {}

    return diff;
  }

  export()
  {
    try {
      fs.mkdirSync(this.mountpoint);
    } catch(e) {}

    try {
      cp.execSync(`mount -t zfs ${this.zpath} ${this.mountpoint}`, {stdio: 'inherit'});
      cp.execSync(`tar cf - -C ${this.mountpoint}/ --exclude '/dev\/*' .`, {stdio: 'inherit'});
    } catch(e) {}

    try {
      cp.execSync(`umount ${this.mountpoint}`);
    } catch(e) {}

    try {
      fs.rmdirSync(this.mountpoint);
    } catch(e) {}
  }

  import(file)
  {
    const opt = {
      created: Math.floor(+new Date() / 1000),
    }

    try {
      fs.mkdirSync(this.mountpoint);
    } catch(e) {}

    try {
      cp.execSync(`zfs create ${Util.fmtOptions(opt)} ${this.zpath}`, {stdio: 'inherit'});
      cp.execSync(`mount -t zfs ${this.zpath} ${this.mountpoint}`, {stdio: 'inherit'});
      cp.execSync(`tar xf ${file} -C ${this.mountpoint}/`, {stdio: 'inherit'});
      cp.execSync(`umount ${this.mountpoint}`, {stdio: 'inherit'});
      cp.execSync(`zfs snapshot ${this.zpath}@ok`, {stdio: 'inherit'});
    } catch(e) {}

    try {
      fs.rmdirSync(this.mountpoint);
    } catch(e) {}
  }

  save()
  {
    try {
      cp.execSync(`zfs send -eR ${this.zpath}@ok`, {stdio: 'inherit'});
    } catch(e) {
      return false;
    }

    return true;
  }

  loadImg()
  {
    let info = cp.execSync(`zfs recv -v -e ${this.path}/images`, {stdio: ['inherit', 'pipe', 'inherit']}).toString();
    info = /into .*\/images\/([a-z0-9]+)@ok$/m.exec(info);

    this.server.storage.invalidateProps();

    if(!info)
      throw 'Unknown image id';

    this.id = info[1];
  }

  toJSON()
  {
    return {
      name: this.name,
      tag: this.tag,
      id: this.id,
      created: this.created,
      size: this.size,
      //zpath: this.zpath,
      //mountpoint: this.mountpoint,
    }
  }

}

module.exports = Image;