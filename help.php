<?

class Help
{
  private $commands = array(    
    "bootstrap" => array('desc' => "Initialize shmocker environment", 'usage' => "ZFSROOT"),  
    "create"    => array('desc' => "Create a new stopped container", 'usage' => "REPOSITORY"),
    "commit"    => array('desc' => "Create a new image from a container's changes", 'usage' => "CONTAINER REPOSITORY"),  
    "exec"      => array('desc' => "Run a command in a running container", 'usage' => "CONTAINER COMMAND [ARG...]"),
    "images"    => array('desc' => "List images", 'usage' => "[REPOSITORY]"),
    "load"      => array('desc' => "Load an image from STDIN", "usage" => ""),
    "ps"        => array('desc' => "List containers", 'usage' => ""),
    "rename"    => array('desc' => "Rename a existing container to a NEW_NAME", "usage" => "OLD_NAME NEW_NAME"),
    "rm"        => array('desc' => "Remove one or more containers", 'usage' => "CONTANIER [CONTAINER...]"),
    "rmi"       => array('desc' => "Remove one or more images", 'usage' => "IMAGE [IMAGE...]"),
    "run"       => array('desc' => "Run a command in a new container", 'usage' => "IMAGE [COMMAND] [ARG...]"),
    "save"      => array('desc' => "Save an image to STDOUT", "usage" => "IMAGE"),
    "start"     => array('desc' => "Start a stopped container", 'usage' => "CONTANIER [CONTAINER...]"), 
    "stop"      => array('desc' => "Stop a running container", 'usage' => "CONTANIER [CONTAINER...]"),  
    "version"   => array('desc' => "Show the shmocker version information", 'usage' => ""),   
  );

  public function show($cmd)
  {
    if($cmd !== false)
    {
      if(isset($this->commands[$cmd]))
      {
        $usage = $this->commands[$cmd]['usage'];
        $desc =  $this->commands[$cmd]['desc'];
        $options =  $this->commands[$cmd]['options'];
        echo "\n";
        echo "Usage: docker $cmd $usage\n";
        echo "\n";
        echo "$desc\n";
        echo "$options\n";
        return;
      }

      echo "Error: Command not found: $cmd\n";
    }

    echo("Usage: shmocker COMMAND [arg...]\n");
    echo("\n");
    echo("A kinda docker clone for FreeBSD\n");
    echo("\n");
    echo("Commands:\n");
    foreach($this->commands as $cmd => $desc)
      echo(sprintf("    %-10.10s %s\n", $cmd, $desc['desc']));
    echo("\n");
  }
}