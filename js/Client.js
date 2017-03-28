const fs = require('fs'),
      Path = require('path'),
      util = require('util'),
      cp = require('child_process');

const pads = (str, len, char = ' ') => {
  let rev = false;
  if(len < 0)
  {
    len *= -1;
    rev = true
  }

  let le = len - ('' + str).length
  if(le > 0)
  {
    if(!rev)
      return char.repeat(le) + str;
    else
      return str + char.repeat(le);
  }
  else
    return str.substring(0, len);
}

process.on('SIGINT', () => console.log('SIGINT'));
process.on('SIGHUP', () => console.log('SIGINT'));
process.on('SIGTERM', () => console.log('SIGINT'));

// TODO: JS:
//   named volumes
//   links
//   hub functions

// TODO: store metadata in json

// TODO: check if docker cmd api has changed
// TODO: make it daemon
// TODO: make docker-client compatible api

// TODO: inspect (img|container|volume)

// TODO: fix container stop on ctrl+c
// TODO: background containers
// TODO: --json
// TODO: refactor client to separate file

// TODO: update link to restarted container

// TODO: volumes-from

function sort_images(a, b)
{
  if(a.created > b.created)
    return 1;
  if(a.created < b.created)
    return -1;
  return 0;
}

const Server = require("./Server");
const Help = require("./Help");
const HubClient = require('./Hub');

class Client {

  error(msg)
  {
    console.error(msg);
    return 1;
  }

  imageMatch(img, name)
  {
    if(img.id == name)
      return true;

    name = name.split(":" , 2);

    if(img.name !== name[0])
      return false;

    if(name.length > 1) // tag is specified
      if(img.tag !== name[1])
        return false;

    return true; // any tag is ok
  }

  findImages(name, list = false)
  {
    if(list === false)
      list = this.srv.listImages(true);
    // find by id

    // return the most recent matching image
    list.sort(sort_images);
    list.reverse();

    return list.filter(img => this.imageMatch(img, name));
  }

  findImage(name, list = false)
  {
    const res = this.findImages(name, list);

    if(!res.length)
      return false;

    return res.shift();
  }

  findContainer(name)
  {
    for(const cnt of this.srv.listContainers())
    {
      if(cnt.id == name)
        return cnt;

      if(cnt.name == name)
        return cnt;
    }

    return false;
  }

  findVolume(name)
  {
    for(const vol of this.srv.listVolumes())
    {
      if(vol.id == name)
        return vol;

      if(vol.name == name)
        return vol;
    }

    return false;
  }

  fmtTime(time)
  {
    // FIXME: fancy dates not implemented

    const pad0 = i => i >= 10 ? `${i}` : `0${i}`;

    if("" + parseInt(time) == time) {
      const date = new Date(time * 1000);

      const yy = date.getFullYear();
      const mm = pad0(date.getMonth() + 1);
      const dd = pad0(date.getDate());

      const h = pad0(date.getHours());
      const m = pad0(date.getMinutes());
      const s = pad0(date.getSeconds());


      return `${yy}-${mm}-${dd} ${h}:${m}:${s}`;
    }

    return '-';
  }

  fmtSize(size)
  {
    const arr = ["b","K","M","G","T"];
    for(let unit of arr)
    {
      if(size < 1024)
        return size + unit;
      size = Math.floor(size / 1024);
    }

    return size + unit;
  }

  fmt(str)
  {
    if(str === false)
      return '-';
    return str;
  }

  idToName(id)
  {
    if(id == false)
      return false;

    const cnt = this.findImage(id);

    if(cnt === false)
      return id;

    if(cnt.name == false)
      return id;

    if(cnt.tag == false)
      return cnt.name;

    return `${cnt.name}:${cnt.tag}`;
  }

  showHelp(cmd = false)
  {
    this.help.show(cmd);
    return 1;
  }

  // ==== commands ====

  helpCmd(argv)
  {
    if(argv.length < 1)
      return this.showHelp();

    const cmd = argv.shift();
    return this.showHelp(cmd);
  }

  psCmd(argv, options)
  {
    let name = false;

    if(argv.length)
      name = argv.shift();

    let containers = this.srv.listContainers();

    containers.sort(sort_images);

    if(options.json === true)
    {
      console.log(JSON.stringify(containers, null, '  ')); // FIXME: containers to json?
      return (containers.length == 0) ? 1 : 0;
    }

    if(!options.quiet)
      console.log([
        "CONTAINER ID", "IMAGE", "COMMAND", "CREATED", "STATUS", "PORTS", "NAMES"
      ].map(m => pads(m, -19)).join(" "));

    let result = 1;
    for(let cnt of containers)
    {
      let ports = "-";
      if(cnt.ports)
        ports = cnt.ports.join(",");

      if(name !== false)
        if(cnt.name != name)
          continue;

      if(options.all === undefined)
        if(!cnt.running)
          continue;

      console.log([
        cnt.id,
        this.idToName(cnt.image),
        cnt.cmd,
        this.fmtTime(cnt.created),
        cnt.running ? "running" : "stopped",
        ports,
        this.fmt(cnt.name),
      ].map(m => pads(m, -19)).join(" "));

      result = 0;
    }

    return result;
  }

  imagesAction(filter, options)
  {
    let images = this.srv.listImages(options.all);

    images.sort(sort_images);

    if(filter)
      return images.filter(img => this.imageMatch(img, filter));

    return images;
  }

  imagesCmd(argv, options)
  {
    let filter = false;
    if(argv.length)
      filter = argv.shift();

    const images = this.imagesAction(filter, options);

    if(options.json === true)
    {
      process.stdout.write(JSON.stringify(images, null, '  '));
      return (images.length == 0) ? 1 : 0;
    }

    if(images.length == 0)
      return 1;

    if(options.quiet == undefined)
      console.log([
        "REPOSITORY", "TAG", "IMAGE ID", "CREATED", "VIRTUAL SIZE"
      ].map(m => pads(m, -19)).join(" "));

    for(let img of images)
      console.log([
        this.fmt(img.name),
        this.fmt(img.tag),
        img.id,
        this.fmtTime(img.created),
        this.fmtSize(img['size']),
      ].map(m => pads(m, -19)).join(" "));

    return 0;
  }


  createCmd(argv, options)
  {
    if(argv.length < 1)
      return this.showHelp("create");

    const image = argv.shift();

    const img = this.findImage(image);
    if(img === false)
      return this.error(`Image '${image}' not found`);

    if(options.name != undefined)
      if(!this.checkNamedContainerUnique(options.name))
        return this.error(`Container '${options.name}' already exists`);

    const c = this.srv.createContainer(img, argv, options);

    if(options.name != undefined)
      c.rename(options.name);

    console.log(c.id);
    return 0;
  }

  rmCmd(argv, options)
  {
    if(argv.length < 1)
      return this.showHelp("rm");

    for(const cont of argv)
    {
      const img = this.findContainer(cont);
      if(img === false)
      {
        this.error(`Container '${cont}' not found`);
        continue;
      }

      if(img.running)
      {
        this.error(`Container '${cont}' is running, cannot delete`);
        continue;
      }

      img.remove();

      console.log(`Removed: ${img.id}`);
    }

    return 0;
  }

  rmiCmd(argv, options)
  {
    if(argv.length < 1)
      return this.showHelp("rmi");

    let result = 0;
    for(const filter of argv)
    {
      const images = this.srv.listImages().filter(img => this.imageMatch(img, filter));

      if(images.length == 0)
        result = this.error(`Image ${filter} not found`);

      for(const img of images)
      {
        img.untag();

        // if(res === false)
        //   result = this.error(`Unable to untag ${filter}`);
        // else
        console.log(`Untagged: ${img.id}`);
      }
    }

    return result;
  }

  commitCmd(argv, options)
  {
    let name = null;

    if(argv.length < 1)
      return this.showHelp("commit");

    const cont = argv.shift();

    if(argv.length)
    {
      name = argv.shift();
      if(this.findImage(name) !== false)
        return this.error(`Image '${name}' already exists`);
    }

    const cnt = this.findContainer(cont);
    if(cnt === false)
      return this.error(`Container '${cont}' not found`);

    const img = this.srv.createImageFromContainer(cnt, options);

    if(name)
    {
      img.addtag(name);
      console.log(`Tagged: ${img.id}`);
    }

    console.log(img.id);
    return 0;
  }

  stopCmd(argv, options)
  {
    if(argv.length < 1)
      return this.showHelp("stop");

    for(const cont of argv)
    {
      const img = this.findContainer(cont);
      if(img === false)
      {
        this.error(`Container '${cont}' not found`);
        continue;
      }

      if(!img.running)
      {
        this.error(`Container '${cont}' already stopped`);
        continue;
      }

      img.stop();
      console.log(`Stopped: ${img.id}`);
    }
    return 0;
  }

  startCmd(argv, options)
  {
    if(argv.length < 1)
      return this.showHelp("start");

    let res = true;
    for(const cont of argv)
    {
      const img = this.findContainer(cont);
      if(img === false)
      {
        this.error(`Container '${cont}' not found`);
        continue;
      }

      if(img.running)
      {
        this.error(`Container '${cont}' already running`);
        continue;
      }

      res = img.start(options);
    }

    return res ? 0 : 1;
  }

  checkNamedContainerUnique(name)
  {
    const cnt = this.findContainer(name);
    if(cnt === false)
      return true;

    if(cnt.running)
      return false;

    if(!cnt.removed)
      return false;

    cnt.remove();

    if(this.findContainer(name)) // check if container deleted successfully
      return true;
  }

  runCmd(argv, options)
  {
    if(argv.length < 1)
      return this.showHelp("run");

    const image = argv.shift();

    const img = this.findImage(image);
    if(img === false)
      return this.error(`Image '${image}' not found`);

    if(options.name !== undefined)
      if(!this.checkNamedContainerUnique(options.name))
        return this.error(`Container '${options.name}' already exists`);

    const c = this.srv.createContainer(img, argv, options);

    if(options.name !== undefined)
      c.rename(options.name);

    const result = c.start(options);

    if(options.remove)
      c.remove();

    return result ? 0 : 1;
  }

  buildCmd(argv, options)
  {
    if(argv.length < 1)
      return this.showHelp("build");

    const file = argv.shift();
    try {
      fs.existsSync(file);
    } catch(e) {
      return this.error('file not found');
    }


    // image name
    if(options.tag !== undefined)
      var tag = options.tag;
    else
      tag = Path.basename(file, ".Dockerfile");

    // send env variables
    let env = "";
    for(const n in options.env)
      env += ` ${Util.escapeshellarg(n)}=${Util.escapeshellarg(options.env[n])}`;

    const shmockerDir = Path.dirname(__filename);

    try {
      cp.execSync(`sh ${shmockerDir}/build.sh ${file} ${tag} ${env}`, {stdio: 'inherit'});
      return 0;
    } catch(e) {
      console.log(e);
      return 1;
    }
  }

  bootstrapCmd(argv, options)
  {
    if(argv.length < 1)
      return this.showHelp("bootstrap");

    const _root = argv.shift();

    if(this.srv.storage.bootstrap(_root))
    {
      console.log("Bootstrap done");
      return 0;
    }

    return this.error("Bootstrap failed");
  }

  execCmd(argv, options)
  {
    if(argv.length < 2)
      return this.showHelp("run");

    const name = argv.shift();

    const cnt = this.findContainer(name);
    if(cnt === false)
      return this.error(`Container '${name}' not found`);

    if(!cnt.running)
      return this.error(`Container '${name}' not running`);

    const result = cnt.exec(argv, options);

    return result ? 0 : 1;
  }

  killCmd(argv, options)
  {
    const cnt = this.requireContainer(argv);

    if(options.signal == undefined)
      options.signal = false;

    return cnt.kill(options.signal) ? 0 : 1;
  }

  importCmd(argv, options)
  {
    // NB this will use php://stdin
    if(argv.length < 1)
      return this.showHelp("import");

    const file = argv.shift();

    if(file != "-")
      try {
        fs.existsSync(file);
      } catch(e) {
        return this.error(`File not found: ${file}`);
      }

    let name = null;
    if(argv.length)
    {
      name = argv.shift();
      const image = this.findImage(name);
      if(image !== false)
        this.error(`Image '${name}' already exists`);
    }

    let img = this.srv.importImage(file);
    if(name !== null)
      if(img)
      {
        img.addtag(name);
        console.log(`Tagged: ${img.id}`);
      }

    console.log(`Imported: ${img.id}`);
    return 0;
  }

  exportCmd(argv, options)
  {
    const image = this.requireImage(argv);
    image.export();
    return 0;
  }

  loadCmd(argv, options)
  {
    // NB: this will use stdin
    const res = this.srv.loadImage();
    if(!res)
      return 1;

    console.log(res.id);
    return 0;
  }

  saveCmd(argv, options)
  {
    const image = this.requireImage(argv);

    if(!image.save())
      return 1;

    return 0;
  }

  renameCmd(argv, options)
  {
    if(argv.length < 2)
      return this.showHelp("rename");

    const cntid = argv.shift();
    const name = argv.shift();

    const cnt = this.findContainer(cntid);
    if(!cnt)
      return this.error(`Container '${cntid}' not found`);

    if(this.findContainer(name) !== false)
      return this.error(`Container '${name}' already exists`);

    const res = cnt.rename(name);
    console.log(`Renamed: ${cnt.id}`);

    return 0;
  }


  // FIXME: moving a tag from img to img doesnt work
  tagCmd(argv, options)
  {
    if(argv.length < 2)
      return this.showHelp("tag");

    const imgid = argv.shift();
    const name = argv.shift();

    const images = this.srv.listImages(true);

    const img = this.findImage(imgid, images);
    if(!img)
      return this.error(`Image '${imgid}' not found`);

    let notag = false;
    for(const f of this.findImages(name, images))
    {
      if(f.id == img.id)
      {
        notag = true;
        continue;
      }

      if(!f.untag(name))
        return this.error(`Image '${name}' already exists, cannot untag`);

      console.log(`Untagged: ${f.id}`);
    }

    if(!notag)
    {
      if(!img.addtag(name))
        return this.error(`Unable to tag '${name}'`);

      console.log(`Tagged: ${img.id}`);
    }

    return 0;
  }

  diffCmd(argv, options)
  {
    if(argv.length < 1)
      return this.showHelp("diff");

    const name = argv.shift();

    const img = this.findImage(name);
    let diff = [];
    if(!img)
    {
      const cont = this.findContainer(name);
      if(!cont)
        return this.error(`Container or image '${name}' not found`);

      diff = cont.diff();
    }
    else
      diff = img.diff();

    for(const line of diff)
      console.log(line);

    return 0;
  }

  wipeCmd(argv, options)
  {
    for(let cnt of this.srv.listContainers())
      if(cnt.running == false)
      {
        cnt.remove();
        console.log(cnt.id);
      }

    this.srv.storage.removePurged();

    return 0;
  }

  requireImage(argv)
  {
    if(argv.length == 0)
    {
      this.showHelp(this.cmd);
      throw "";
    }

    const value = argv.shift();
    const img = this.findImage(value);
    if(img === false)
    {
      this.error(`Image '${value}' not found`);
      throw "";
    }

    return img;
  }

  requireContainer(argv)
  {
    if(argv.length == 0)
    {
      this.showHelp(this.cmd);
      throw "";
    }

    const value = argv.shift();
    const cnt = this.findContainer(value);
    if(cnt === false)
    {
      this.error(`Container '${value}' not found`);
      throw "";
    }

    return cnt;
  }

  versionCmd(argv, options)
  {
    console.log("Shmocker JS version 1.6");
    return 0;
  }

  cpCmd(argv, options)
  {
    if(argv.length < 2)
      return this.showHelp("cp");

    const from = argv.shift().split(":", 2);
    const to = argv.shift().split(":", 2);


    if(from.length > 1) // from container to host fs
    {
      const cont = this.findContainer(from[0]);
      if(cont == false)
        return this.error(`Container '${from[0]}' not found`);

      cont.copyFrom(from[1], to[0]);

      return 0;
    }

    if(to.length > 1)   // from host fs to container
    {
      const cont = this.findContainer(to[0]);
      if(cont == false)
        return this.error(`Container '${to[0]}' not found`);

      cont.copyTo(from[0], to[1]);

      return 0;
    }

    return this.showHelp('cp');
  }

  volumeCreateCmd(argv, options)
  {
    if(options.name != undefined)
      if(this.findVolume(options.name) !== false)
        return this.error(`Volume '${options.name}' already exists`);

    const v = this.srv.createVolume();

    if(options.name != undefined)
      v.rename(options.name);

    console.log(v.id);
    return 0;
  }

  volumeLsCmd(argv, options)
  {
    let result = 1;
    let filter = false;
    if(argv.length)
      filter = argv.shift();

    const images = this.srv.listVolumes();

    images.sort(sort_images);

    if(!options.quiet)
      console.log([
        "VOLUME ID", "NAME", "DRIVER"
      ].map(m => pads(m, -19)).join(" "));

    for(const img of images)
    {
      if(filter)
        if(!this.imageMatch(img, filter))
          continue;

      result = 0;

      console.log([
        img.id, this.fmt(img.name), img.driver
      ].map(m => pads(m, -19)).join(" "));
    }

    return result;
  }

  volumeRmCmd(argv, options)
  {
    if(argv.length < 1)
      return this.showHelp("volume rm");

    for(const volume of argv)
    {
      const vol = this.findVolume(volume);
      if(vol === false)
      {
        this.error(`Volume '${volume}' not found`);
        continue;
      }

      vol.remove();
      console.log(vol.id);
    }
  }

  //  function upgradeCmd(argv, options)
  // {
  //   host = "hx3.a-real.ru";
  //   if(count(argv) > 0)
  //     host = argv.shift();

  //   if(options['json'] === true)
  //   {
  //     hubImgs = this.hub.listImages(host);
  //     echo json_encode(hubImgs, JSON_PRETTY_PRINT);
  //     echo "\n";
  //     return is_array(hubImgs) ? 0 : 1;
  //   }

  //   images = this.srv.listImages();

  //   // get names of all known images
  //   names = [];
  //   foreach(images as img)
  //     names[img['name']] = img['name'];

  //   result = 0;
  //   foreach(names as name)
  //   {
  //     echo "Upgrading name:\n";
  //     if(this.pullCmd(["host/name"], []))
  //       result = 1;
  //   }

  //   return result;
  // }

  volumeCmd(argv, options)
  {
    if(argv.length < 1)
      return this.showHelp("volume");

    const cmd = argv.shift();

    options = this.processOptions(argv);
    if(options === false)
      return this.showHelp("volume cmd");

    switch(cmd)
    {
    case "create":
      return this.volumeCreateCmd(argv, options);

    case "rm":
      return this.volumeRmCmd(argv, options);

    case "ls":
      return this.volumeLsCmd(argv, options);

    default:
      return this.showHelp("volume");
    }
  }

  // ==

  processOptions(argv)
  {
    let options = {
      volumes: [],
      env: [],
      links: [],
      ports: [],
    }

    while(argv.length)
    {
      let cmd = argv.shift();

      switch(cmd)
      {
      case "-a":
      case "--all":
        options.all = true;
        break;

      case "--cmd":
        options.cmd = argv.shift();
        break;

      case "-d":
        options.detach = true;
        break;

      case "-e":
      case "--env":
        if(!argv.length)
          return false;

        let env = argv.shift().split(":", 2);
        if(env.length == 2)
          options.env[env[0]] = env[1];
        break;

      case "--entrypoint":
        options.entrypoint = argv.shift();
        break;

      case "-h":
      case "--hostname":
        if(!argv.length)
          return false;

        options.hostname = argv.shift();
        break;

      case "-I":
      case "--ip":
        if(!argv.length)
          return false;

        options.ip = argv.shift();
        break;

      case "--json":
        options.json = true;
        break;

      case "--link":
        if(!argv.length)
          return false;

        let lnk = argv.shift().split(":", 2);
        if(lnk.length == 1)
          options.links.push({name: lnk[0], alias: lnk[0]});
        if(lnk.length == 2)
          options.links.push({name: lnk[0], alias: lnk[1]});
        break;

      case "-n":
      case "--name":
        if(!argv.length)
          return false;

        options.name = argv.shift();
        break;

      case "-p":
        if(!argv.length)
          return false;

        let port = argv.shift().split(":", 2);
        if(port.length == 1)
          options.ports.push({src: port[0], dst: port[0]});
        if(port.length == 2)
          options.ports.push({src: port[0], dst: port[1]});
        break;

      case "-q":
      case "--quiet":
        options.quiet = true;
        break;

      case "--rm":
        options.remove = true;
        break;

      case "-s":
      case "--signal":
        if(!argv.length)
          return false;

        options.signal = argv.shift();
        break;

      case "-t":
      case "--tag": // for docker build
        if(!argv.length)
          return false;

        options.tag = argv.shift();
        break;

      case "-v":
        if(!argv.length)
          return false;

        let vol = argv.shift().split(":", 3);
        if(vol.length == 1)
          options.volumes.push({src: vol[0], dst: vol[0], mode: "rw"});
        if(vol.length == 2)
          options.volumes.push({src: vol[0], dst: vol[1], mode: "rw"});
        if(vol.length == 3)
          options.volumes.push({src: vol[0], dst: vol[1], mode: vol[2]});
        break;

      default:
        argv.unshift(cmd);
        return options;
      }
    }

    return options;
  }

  processArgs(argv) {
    if(!argv.length)
      return this.showHelp();

    argv.shift(); // FIXME: remove script name

    let cmd = argv.shift();

    this.cmd = cmd; // save command for error-messages
    this.argv = argv;

    try {
      const options = this.processOptions(argv);
      if(options === false)
        return this.showHelp(cmd);

      if(typeof this[cmd+'Cmd'] === 'function')
        return this[cmd+'Cmd'].call(this, argv, options);

      return this.helpCmd(argv, options);
    } catch(e) {
      console.log(e);
      return 1;
    }
  }

  loadConfig() {
    // try to autoload .shmocker
    let dir = fs.realpathSync(process.cwd());
    while(true)
    {
      const file = dir + '/.shmocker';
      try {
        fs.accessSync(file);

        const cfg = JSON.parse(fs.readFileSync(file));
        if(typeof cfg == 'object')
          return cfg;
      } catch(e) { } // FIXME: show an error

      const dir2 = Path.dirname(dir);
      if(dir2 == dir)
        break;

      dir = dir2;
    }

    return {};
  }

  main(argv) {
    const cfg = this.loadConfig();

    this.srv = new Server(cfg.path);
    this.hub = new HubClient();
    this.help = new Help();

    argv.shift();
    return this.processArgs(argv);
  }
}


module.exports = Client;