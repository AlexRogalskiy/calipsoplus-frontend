import { Component, OnInit } from "@angular/core";
import { CalipsoplusService } from "../calipsoplus.service";

import { CalipsoResource } from "../calipso-resource";
import { CalipsoContainer } from "../calipso-container";
import { CalipsoImage } from "../calipso-image";

import { Router } from "@angular/router";
import { CalipsoQuota } from "../calipso-quota";

export enum Status {
  idle = 0, // ready
  busy = 1, // waitting
  running = 2, // runing
  full = 3, // forbidden
  error = 4 // error
}

@Component({
  selector: "app-select-calipso-resource-form",
  templateUrl: "./select-calipso-resource-form.component.html",
  styleUrls: ["./select-calipso-resource-form.component.css"]
})
export class SelectCalipsoResourceFormComponent implements OnInit {
  containers: CalipsoContainer[] = [];
  resources: CalipsoResource[] = [];
  availableImages: CalipsoImage[] = [];

  constructor(
    private calipsoService: CalipsoplusService,
    private router: Router
  ) {}

  safe_locked_button: boolean = false;
  staff_forbbiden: boolean = false;

  statusActiveSessions: { [key: string]: Status } = {};
  actualRunningContainer: { [key: string]: string } = {};
  used_quota: CalipsoQuota= new CalipsoQuota(0, 0, "0", "0");
  user_quota: CalipsoQuota= new CalipsoQuota(0, 0, "0", "0");

  max_num_machines_exceeded: boolean = false;
  max_num_cpu_exceeded: boolean = false;
  max_memory_exceeded: boolean = false;
  max_hdd_exceeded: boolean = false;

  public resources_update() {
    if (this.resources) this.resources.splice(0, this.resources.length);
    if (this.containers) this.containers.splice(0, this.containers.length);

    if (this.calipsoService.isLogged()) {
      let username = this.calipsoService.getLoggedUserName();

      //get all containers active from user
      this.calipsoService.listContainersActive(username).subscribe(res => {
        this.containers = res;

        this.containers.forEach(
          element => {
            var c = this.containers.find(
              x => x.calipso_experiment == element.calipso_experiment
            );
            if (c != null) {
              let date = new Date(c.creation_date);
              let str_creation_date = this.calipsoService.formatDate(date);
              let date_access = this.calipsoService.getDateAccess(
                c.container_name
              );
              if (c.container_status == "created") {
                var resource: CalipsoResource = new CalipsoResource(
                  c.calipso_experiment,
                  c.container_name,
                  c.public_name,
                  str_creation_date,
                  "-",
                  date_access,
                  c.container_info,
                  c.public_name
                );
                this.resources.push(resource);
                this.statusActiveSessions[resource.experiment] = Status.running;
                this.check_quota(c.public_name);
              }
            }
          },
          err => {
            this.router.navigate(["/"]);
            //console.log("Secutiry error");
          }
        );
      });
    } else this.router.navigate(["/"]);
  }

  public load_all_images() {
    this.calipsoService.getAllAvailableImages().subscribe(images => {
      this.availableImages = images;
    });
  }

  public get_icon(base_image:string){
    return this.calipsoService.get_icon(base_image);
  }


  ngOnInit() {
    if (this.calipsoService.isLogged()) {
      this.calipsoService.getCalipsoUserType().subscribe(user_type => {
        let username = this.getUsername();
        this.statusActiveSessions[username] = Status.idle;
        if (user_type.result) {
          this.staff_forbbiden = false;
        } else {
          this.safe_locked_button = true;
          this.staff_forbbiden = true;
        }
        this.load_all_images();
        this.resources_update();
      });
    } else {
      this.router.navigate(["/"]);
    }


  }

  public go_in(session_proposal_id: string) {
    var c = this.containers.find(
      x => x.calipso_experiment == session_proposal_id
    );
    if (c == null) console.log("error win up");
    else if (c.host_port == "") {
      this.calipsoService.go_into_resource(
        c.container_name,
        c.guacamole_username,
        c.guacamole_password
      );
    } else {
      this.calipsoService.openURL(c.host_port, c.container_name);
    }
  }

  public stop_and_remove_resource(proposal_id: string, public_name: string) {
    let username = this.getUsername();
    this.statusActiveSessions[proposal_id] = Status.busy;
    this.safe_locked_button = true;

    var c = this.containers.find(x => x.calipso_experiment == proposal_id);

    this.calipsoService
      .stopContainer(username, c.container_name, public_name)
      .subscribe(data => {
        this.containers.find(x => x.id == data.id).container_status =
          data.container_status;

        this.calipsoService
          .removeContainer(username, c.container_name, public_name)
          .subscribe(cdata => {
            this.check_quota(cdata.public_name);

            this.containers.find(x => x.id == cdata.id).container_status =
              cdata.container_status;

            this.containers.forEach((item, index) => {
              if (item.container_name === cdata.container_name) {
                this.containers.splice(index, 1);
                this.calipsoService.removeDateAccess(cdata.container_name);
              }
            });

            this.statusActiveSessions[proposal_id] = Status.idle;
            this.safe_locked_button = false;

            this.resources_update();
          });
      });
  }

  public ifDisabled() {
    let username = this.getUsername();

    if (
      this.statusActiveSessions[username] == Status.busy ||
      this.statusActiveSessions[username] == Status.running ||
      this.max_num_machines_exceeded ||
      this.max_num_cpu_exceeded ||
      this.max_memory_exceeded ||
      this.max_hdd_exceeded
    )
      return "disabled";
    else return "";
  }

  public getUsername() {
    return this.calipsoService.getLoggedUserName();
  }

  public run(base_image: string) {
    let username = this.getUsername();

    this.statusActiveSessions[username] = Status.busy;
    this.actualRunningContainer[username] = base_image;
    this.safe_locked_button = true;

    this.calipsoService.runResource(username, username, base_image).subscribe(
      data => {
        if (data != null) {
          this.containers.push(data);
          this.statusActiveSessions[username] = Status.running;
          this.resources_update();
          this.check_quota(data.public_name);
        } else {
          this.statusActiveSessions[username] = Status.idle;
        }

      },
      error => {
        this.statusActiveSessions[username] = Status.idle;
        this.safe_locked_button = false;
        console.log("Ooops!");
      }
    );
  }
  private check_quota(base_image: string) {
    let username = this.calipsoService.getLoggedUserName();
    this.calipsoService
      .getCalipsoAvailableImageQuota(username)
      .subscribe(used => {
        this.used_quota = used;

        this.calipsoService.getCalipsoQuota(username).subscribe(user_quota => {
          this.user_quota = user_quota;

          let max_available =
            this.user_quota.max_simultaneous -
            this.used_quota.max_simultaneous;
          let cpu_available = this.user_quota.cpu - this.used_quota.cpu;
          let hdd_available =
            parseInt(this.user_quota.hdd.slice(0, -1)) -
            parseInt(this.used_quota.hdd.slice(0, -1));
          let memory_available =
            parseInt(this.user_quota.memory.slice(0, -1)) -
            parseInt(this.used_quota.memory.slice(0, -1));

          this.max_num_machines_exceeded = max_available <= 0;

          this.calipsoService
            .getImageQuotaByPublicName(base_image)
            .subscribe(image_quota => {
              this.max_num_cpu_exceeded =
                cpu_available - image_quota.cpu < 0;
              this.max_memory_exceeded =
                memory_available -
                  parseInt(image_quota.memory.slice(0, -1)) <
                0;
              this.max_hdd_exceeded =
                hdd_available - parseInt(image_quota.hdd.slice(0, -1)) < 0;
            });
        });
      });
  }
}
