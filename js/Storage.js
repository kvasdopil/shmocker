cp = require('child_process'),
      Path = require('path'),
      fs = require('fs');

let props = false;

class Storage {
  constructor(path)
  {
    this.path = path;
  }

  bootstrap(root)
  {
    const zfsl = cp.execSync(`zfs list -H ${root}`).trim().split("\n");
    if(zfsl.length < 0)
      return false;

    cp.execSync(`zfs set shmocker:root=1 ${root}}`);
    cp.execSync(`zfs create -omountpoint=legacy ${root}/images`);
    cp.execSync(`zfs create -omountpoint=legacy ${root}/jails`);
    cp.execSync(`zfs create -omountpoint=legacy ${root}/vol`);

    return true;
  }

  getPath()
  {
    if(this.path !== false)
      return this.path;

    for(var line of cp.execSync("zfs get -s local -Hr shmocker:root").toString().trim().split("\n"))
    {
      line = line.split("\t")
      return this.path = line[0];
    }

    return false;
  }

  getZfs(regexp)
  {
    return cp.execSync(`zfs list -Hp -t all -r ${this.getPath()}`).toString().trim().split("\n")
      .map(line => line.split("\t"));
  }

  getContainers()
  {
    const re = new RegExp(`^${this.getPath()}/jails/([0-9a-f]+)`);

    return this.getZfs()
      .map(zfs => re.exec(zfs[0]))
      .filter(r => r)
      .map(r => r[1]);
  }

  getImages()
  {
    const re = new RegExp(`^${this.getPath()}/images/([0-9A-Za-z]+)@ok`);

    return this.getZfs()
      .map(zfs => re.exec(zfs[0]))
      .filter(r => r)
      .map(r => r[1]);
  }

  getVolumes()
  {
    const re = new RegExp(`^${this.getPath()}/vol/([0-9a-f]+)`);

    return this.getZfs()
      .map(zfs => re.exec(zfs[0]))
      .filter(r => r)
      .map(r => r[1]);
  }

  listVolumesForDeletion()
  {
    return cp.execSync(`zfs get -s local -Hr shmocker:remove ${this.getPath()}/vol`)
      .toString().trim().split("\n")
      .map(line => line.split("\t"))
      .filter(line => line[2] == "1")
      .map(line => line[0]);
  }

  removePurged()
  {
    let success = true;

    const path = this.getPath();
    while(success)
    {
      success = false;
      const images = [];

      for(const id of this.listVolumesForDeletion())
        images.push(id);

      for(const id of this.getImages())
        if(!this.getProp(id, "shmocker:tags"))
          images.push(`${this.getPath()}/images/${id}`);

      for(const img of images)
        try {
          cp.execSync(`zfs destroy -r ${img} 2> /dev/null`);

          try {
            fs.rmdirSync(`/mnt/${Path.basename(img)}`);
          } catch(e) {}

          success = true;
        } catch(e) {}
    }

    this.invalidateProps(); // invalidate props cache
  }

  readProps()
  {
    if(props !== false)
      return props;

    const path = this.getPath();
    let result = {};

    const re = new RegExp('^(shmocker:[a-zA-Z0-9_-]+):([a-zA-Z0-9_-]+)');

    for(let line of cp.execSync(`zfs get -rHp all ${this.getPath()}`).toString().trim().split("\n"))
    {
      line = line.split("\t", 4);

      const fs = Path.basename(line[0]);
      const fld = line[1];

      if(result[fs] === undefined)
        result[fs] = {};

      const arr = re.exec(fld);
      if(arr) // array field
      {
        if(result[fs][arr[1]] == undefined)
          result[fs][arr[1]] = {};

        result[fs][arr[1]][arr[2]] = line[2];
        //result[fs][arr[1]].push(line[2]);  // FIXME: array index not preserved
      }
      else
        result[fs][fld] = line[2];
    }

    return props = result;
  }

  invalidateProps()
  {
    props = false;
  }

  getProp(id, field)
  {
    id = Path.basename(id);

    const props = this.readProps();

    if(props[id] !== undefined)
      if(props[id][field] !== undefined)
        return props[id][field];

    return false;
  }
}

module.exports = Storage;