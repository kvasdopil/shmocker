<?

require_once(dirname(__FILE__). "/containers.php");
require_once(dirname(__FILE__). "/help.php");

// TODO: mutiple tags
// TODO: tags add\remove
// TODO: images rename
// TODO: actualize image selection logic
// TODO: names for containers
// TODO: show purged images

// FIXME: name:tag conflict on import

// TODO: proper jail start/stop
// TODO: proper /dev umount

// TODO: port forwards

// TODO: volumes

date_default_timezone_set("Europe/Moscow");

class Client
{
  private $srv = false;

  function error($msg)
  {
    echo "$msg\n";
    return 1;
  }

  function imageMatch($img, $name)
  {
    if($img['id'] == $name)
      return true;

    $name = explode(":", $name, 2);
    
    if($img['name'] !== $name[0])
      return false;

    if(count($name) > 1) // tag is specified
      if($img['tag'] !== $name[1])
        return false;

    return true; // any tag is ok
  }

  function findImage($name)
  {    
    $list = $this->srv->listImages();
    // find by id
    foreach($list as $img)      
      if($this->imageMatch($img, $name))
        return $img;

    return false;
  }

  function findContainer($name)
  {
    foreach($this->srv->listContainers() as $cnt)
    {
      if($cnt['id'] == $name)
        return $cnt;

      if($cnt['name'] == $name)
        return $cnt;
    }

    return false;
  }

  function fmtTime($time)
  {
    return strftime("%F %T", $time);
  }

  function fmtSize($size)
  {
    $arr = array("b","K","M","G","T");
    foreach($arr as $unit)
    {
      if($size < 1024)
        return $size . $unit;
      $size = intval($size / 1024);
    }
    
    return $size . $unit;
  }

  private function idToName($id)
  {
    $cnt = $this->findImage($id);

    if(!$cnt)
      return $id;

    if($cnt['name'] == "-")
      return $id;

    if($cnt['tag'] == "-")
      return $cnt['name'];

    return "{$cnt['name']}:{$cnt['tag']}";
  }

  function showHelp($cmd = false)
  {
    $help = new Help();
    $help->show($cmd);
    return 1;
  }

  // ==== commands ====

  function psCmd($argv)
  {
    $showStopped = false;
    foreach($argv as $arg)
      if($arg == "-a")
        $showStopped = true;

    echo("CONTAINER ID        IMAGE               COMMAND             CREATED             STATUS              PORTS               NAMES\n");
    foreach($this->srv->listContainers() as $cnt)
    {
      if($cnt['running'] == false)
        if($showStopped == false)
          continue;

      echo sprintf(
        "%-19.19s %-19.19s %-19.19s %-19.19s %-19.19s %-19.19s %-20.20s\n", 
        $cnt['id'],
        $this->idToName($cnt['image']),
        $cnt['cmd'],
        $this->fmtTime($cnt['created']),
        ($cnt['running'] ? "running" : "stopped"),
        "-",
        $cnt['name']
      );
    }
  }

  function imagesCmd($argv)
  {
    $filter = false;
    if(count($argv))
      $filter = array_shift($argv);

    echo("REPOSITORY          TAG                 IMAGE ID            CREATED             VIRTUAL SIZE\n");
    foreach($this->srv->listImages() as $img)    
    {
      if($filter)
        if(!$this->imageMatch($img, $filter))
          continue;

      echo sprintf(
        "%-19.19s %-19.19s %-19.19s %-19.19s %-20.20s\n", 
        $img['name'],
        $img['tag'],
        $img['id'],
        $this->fmtTime($img['created']),
        $this->fmtSize($img['size'])
      );
    }
  }

  function createCmd($argv)
  {
    if(count($argv) < 2)
      return $this->showHelp("create");

    $image = array_shift($argv);

    $img = $this->findImage($image);
    if($img === false)
      return $this->error("Image '$image' not found");

    $res = $this->srv->createContainer($img['id'], $argv);
    echo "$res\n";
    return 0;
  }

  function rmCmd($argv)
  {
    if(count($argv) < 1)
      return $this->showHelp("rm");

    foreach ($argv as $cont) 
    {
      $img = $this->findContainer($cont);
      if($img === false)
      {
        $this->error("Container '$cont' not found");
        continue;
      }

      if($img['running'])
      {
        $this->error("Container '$cont' is running, cannot delete");
        continue;
      }

      $res = $this->srv->removeContainer($img['id']);
      echo "$res\n"; 
    }

    return 0;
  }

  function rmiCmd($argv)
  {
    if(count($argv) < 1)
      return $this->showHelp("rmi");

    foreach($argv as $image)
    {
      $img = $this->findImage($image);
      if($img === false)
      {
        $this->error("Image '$image' not found");
        continue;
      }
      
      foreach($this->srv->listContainers() as $cnt)
        if($cnt['image'] == $img['id'])
        {
          $this->error("Container '{$cnt['id']}' is using image '$image', cannot delete");
          continue 2;
        }
    
      $res = $this->srv->removeImage($img['id']);
      echo "$res\n";
    }
  }

  function commitCmd($argv)
  {
    if(count($argv) < 2)
      return $this->showHelp("commit");

    $cont = array_shift($argv);
    $name = array_shift($argv);

    if($this->findImage($name) !== false)
      return $this->error("Image '$name' already exists");

    $img = $this->findContainer($cont);
    if($img === false)
      return $this->error("Container '$cont' not found");

    $id = $this->srv->createImageFromContainer($img['id']);
    $this->srv->renameImage($id, $name);
    echo "$id\n";
    return 0;  
  }

  function stopCmd($argv)
  {
    if(count($argv) < 1)
      return $this->showHelp("stop");

    foreach($argv as $cont)
    {
      $img = $this->findContainer($cont);
      if($img === false)
      {
        $this->error("Container '$cont' not found"); 
        continue;
      }

      if(!$img['running'])
      {
        $this->error("Container '$cont' already stopped");
        continue;
      }

      $res = $this->srv->stopContainer($img['id']);
      echo "$res\n";
    }
    return 0;
  }

  function startCmd($argv)
  {
    $options = array(
      'volumes' => array()
    );

    if(count($argv))
    {
      $cmd = array_shift($argv);
      switch($cmd)
      {
      case "-v":
        if(!count($argv))
          return $this->showHelp("run");

        $vol = explode(":", array_shift($argv), 3);
        if(count($vol) == 1)
          $options['volumes'][] = array("src" => $vol[0], "dst" => $vol[0], "mode" => "rw");
        if(count($vol) == 2)
          $options['volumes'][] = array("src" => $vol[0], "dst" => $vol[1], "mode" => "rw");
        if(count($vol) == 3)
          $options['volumes'][] = array("src" => $vol[0], "dst" => $vol[1], "mode" => $vol[3]);
        break;

      default:
        array_unshift($argv, $cmd);
      }
    }
    
    if(count($argv) < 1)
      return $this->showHelp("start");

    foreach($argv as $cont)
    {    
      $img = $this->findContainer($cont);    
      if($img === false)
      {
        $this->error("Container '$cont' not found"); 
        continue;
      }

      if($img['running'])
      {
        $this->error("Container '$cont' already running");
        continue;
      }

      $res = $this->srv->startContainer($img['id'], $options);
      echo "$res\n";
    }

    return 0;
  }

  function runCmd($argv)
  {
    $options = array(
      'volumes' => array()
    );

    if(count($argv))
    {
      $cmd = array_shift($argv);
      switch($cmd)
      {
      case "-v":
        if(!count($argv))
          return $this->showHelp("run");

        $vol = explode(":", array_shift($argv), 3);
        if(count($vol) == 1)
          $options['volumes'][] = array("src" => $vol[0], "dst" => $vol[0], "mode" => "rw");
        if(count($vol) == 2)
          $options['volumes'][] = array("src" => $vol[0], "dst" => $vol[1], "mode" => "rw");
        if(count($vol) == 3)
          $options['volumes'][] = array("src" => $vol[0], "dst" => $vol[1], "mode" => $vol[3]);
        break;

      default:
        array_unshift($argv, $cmd);
      }
    }

    if(count($argv) < 2)
      return $this->showHelp("run");

    $image = array_shift($argv);

    $img = $this->findImage($image);
    if($img === false)
      return $this->error("Image '$image' not found");

    $res = $this->srv->createContainer($img['id'], $argv);
    $res = $this->srv->startContainer($res, $options);
    echo "$res\n";
    return 0;
  }

  function bootstrapCmd($argv)
  {
    if(count($argv) < 1)
      return $this->showHelp("bootstrap");

    $root = array_shift($argv);

    if($this->srv->bootstrap($root))
    {
      echo "Bootstrap done\n";
      return 0;
    }

    echo "Bootstrap failed\n";
    return 1;
  }

  function execCmd($argv)
  {
    if(count($argv) < 2)
      return $this->showHelp("run");

    $name = array_shift($argv);

    $cnt = $this->findContainer($name);
    if($cnt === false)
      return $this->error("Container '$name' not found");

    if(!$cnt['running'])
      return $this->error("Container '$name' not running");

    $res = $this->srv->execCommandInContainer($cnt['id'], $argv);
    echo "$res\n";
    return 0;
  }

  function loadCmd($argv)
  {
    // NB this will use php://stdin
    $res = $this->srv->loadImage();
    echo "$res\n";
    return 0;
  }

  function saveCmd($argv)
  {
    if(count($argv) < 1)
      return $this->showHelp("save");

    $img = array_shift($argv);

    $image = $this->findImage($img);
    if($image === false)
      return $this->error("Image '$img' not found");

    $res = $this->srv->saveImage($image['id']);
    return 0;
  }

  function renameCmd($argv)
  {
    if(count($argv) < 2)
      return $this->showHelp("rename");    

    $cntid = array_shift($argv);
    $name = array_shift($argv);

    $cnt = $this->findContainer($cntid);
    if(!$cnt)
      return $this->error("Container '$cnt' not found");

    if($this->findContainer($name) !== false)
      return $this->error("Container '$name' already exists");

    $res = $this->srv->renameContainer($cnt['id'], $name);
    return 0;
  }

  function tagCmd($argv)
  {
    if(count($argv) < 2)
      return $this->showHelp("tag");    

    $imgid = array_shift($argv);
    $name = array_shift($argv);

    $img = $this->findImage($imgid);
    if(!$img)
      return $this->error("Image '$img' not found");

    if($this->findImage($name) !== false)
      return $this->error("Image '$img' already exists");

    $res = $this->srv->renameImage($img['id'], $name);
    return 0;
  }

  function diffCmd($argv)
  {
    $cnt = $this->requireContainer();

    $diff = $this->srv->diffForContainer($cnt['id']);
    foreach ($diff as $line) 
      echo "$line\n";

    return 0;
  }

  function pullCmd($argv)
  {
    if(count($argv) < 1)
      return $this->showHelp('pull');

    $name = array_shift($argv);

    $this->srv->fetchImage($name);
  }

  function requireContainer()
  {
    if(count($this->argv) == 0)
    {
      $this->showHelp($this->cmd);
      throw new Exception();
    }

    $value = array_shift($this->argv);
    $cnt = $this->findContainer($value);
    if($cnt === false)
    {
      $this->error("Container '$value' not found");
      throw new Exception();
    }

    return $cnt;
  }

  function versionCmd()
  {
    echo("Shmocker version 0.1\n");
    return 0;
  }

  // =====

  private $cmd;
  private $argv;

  private function processArgs($argv)
  {
    if(!count($argv))
      return $this->showHelp();

    $cmd = array_shift($argv);

    $this->cmd = $cmd; // save command for error-messages
    $this->argv = $argv;

    try
    {
      switch($cmd)
      {
      case "bootstrap":
        return $this->bootstrapCmd($argv);

      case "images":
        return $this->imagesCmd($argv);

      case "ps":
        return $this->psCmd($argv);

      case "create":
        return $this->createCmd($argv);

      case "rm":
        return $this->rmCmd($argv);

      case "commit":
        return $this->commitCmd($argv);

      case "rmi":
        return $this->rmiCmd($argv);

      case "stop":
        return $this->stopCmd($argv);

      case "start":
        return $this->startCmd($argv);

      case "run":
        return $this->runCmd($argv);

      case "version":
        return $this->versionCmd();

      case "exec":
        return $this->execCmd($argv);

      case "load":
        return $this->loadCmd($argv);

      case "save":
        return $this->saveCmd($argv);

      case "rename":
        return $this->renameCmd($argv);

      case "tag":
        return $this->tagCmd($argv);      

      case "diff":
        return $this->diffCmd($argv);

      case "pull":
        return $this->pullCmd($argv);

      default:
        return $this->showHelp($cmd);
      }
    }
    catch(Exception $e)
    {
      return 1;
    }
  }

  public function main($argv)
  {
    $this->srv = new Containers();

    array_shift($argv);
    exit($this->processArgs($argv));
  }
}


$c = new Client();
$c->main($argv);
