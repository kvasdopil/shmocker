const cp = require('child_process'),
      Path = require('path'),
      fs = require('fs'),
      Container = require('./Container'),
      Volume = require('./Volume'),
      Image = require('./Image'),
      Util = require('./Util'),
      Storage = require('./Storage');

class Server
{
  constructor(path = false)
  {
    this.storage = new Storage(path);
  }

  // ===

  listContainers()
  {
    let result = [];
    for(const id of this.storage.getContainers())
    {
      const c = new Container(this, id);
      c.load();

      result.push(c);
    }

    return result;
  }

  createContainer(image, cmd, options)
  {
    const cont = new Container(this, this.getId());
    cont.create(image, cmd, options);

    return cont;
  }

  // ===

  listImages(all = false)
  {
    let result = [];

    for(const id of this.storage.getImages())
    {
      let tags = this.storage.getProp(id, "shmocker:tags");

      if(!tags)
        if(all)
          tags = [':'];
        else
          tags = [];

      for(const t in tags)
      {
        const i = new Image(this, id, tags[t])
        i.load();

        result.push(i);
      }
    }

    return result;
  }

  createImageFromContainer(cont, options)
  {
    const image = new Image(this, this.getId(), ":"); // FIXME: no tag?
    cont.commit(image, options);

    return image;
  }

  // ===

  createVolume()
  {
    const v = new Volume(this, this.getId());
    v.create();

    return v;
  }

  listVolumes(all = false)
  {
    let result = [];

    for(const id of this.storage.getVolumes())
    {
      const v = new Volume(this, id);

      v.load();

      if(!all)
        if(v.removed)
          continue;

      result.push(v);
    }

    return result;
  }

  // ===

  findVolume(name) // FIXME: copypaste!
  {
    for(const vol of this.listVolumes())
    {
      if(vol.id == name)
        return vol;

      if(vol.name == name)
        return vol;
    }
    return false;
  }

//   // == images ==

  importImage(file)
  {
    const i = new Image(this, this.getId(), ":");

    i.import(file);

    return i;
  }

  loadImage()
  {
    const i = new Image(this, false, ":");
    try {
      i.loadImg();
      return i;
    } catch(e) {
      return false;
    }

    return false;
  }

  // loadImageFromStream(cb)
  // {
  //   root = this.getPath();
  //   desc = [
  //     ['pipe', 'r'],
  //     //['file', '/dev/null', 'a'],
  //     //['file', '/dev/null', 'a']
  //   ];
  //   proc = proc_open("xz -d | zfs recv -e root/images", desc, pipes);

  //   cb(pipes[0], proc);

  //   fclose(pipes[0]);
  //   while(true)
  //   {
  //     st = proc_get_status(proc);
  //     if(!st['running'])
  //       break;
  //   }
  //   proc_close(proc);

  //this.server.storage.invalidateProps();

  //   return (st["exitcode"] === 0);
  // }

//   // === private functions ===

  getId()
  {
    const rand = (a, b) => Math.floor(Math.random() * (b - a) + a);

    return rand(0xa00000, 0xffffff).toString(16) + rand(0x100000, 0xffffff).toString(16);
  }
}

module.exports = Server;