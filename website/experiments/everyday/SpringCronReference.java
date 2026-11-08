import java.time.*;
import java.time.zone.ZoneRulesProvider;
import org.springframework.scheduling.support.CronExpression;
public class SpringCronReference {
  public static void main(String[] args) {
    System.out.println("JDK=" + System.getProperty("java.runtime.version"));
    System.out.println("tzdata=" + ZoneRulesProvider.getVersions("America/New_York").lastKey());
    for (String row : new String[]{
      "0 30 2 * * *|2026-03-08T06:00:00Z", "0 30 1 * * *|2026-11-01T04:00:00Z",
      "0 */30 * * * *|2026-03-08T06:45:00Z", "0 */30 * * * *|2026-11-01T04:45:00Z",
      "0 0 9 31W * *|2026-01-01T00:00:00Z",
      "0 0 9 LW * *|2026-01-01T00:00:00Z", "0 0 9 1W * *|2026-01-01T00:00:00Z",
      "0 0 9 L-2 * *|2026-01-01T00:00:00Z", "0 0 9 * * 5L|2026-01-01T00:00:00Z",
      "0 0 9 * * MON#2|2026-01-01T00:00:00Z", "0 0 9 1 * MON|2026-01-01T00:00:00Z"}) {
      String[] parts = row.split("\\|");
      var cron = CronExpression.parse(parts[0]);
      var time = Instant.parse(parts[1]).atZone(ZoneId.of("America/New_York"));
      System.out.print(row);
      for (int i=0;i<10;i++) {time=cron.next(time); System.out.print("|"+time.toInstant());}
      System.out.println();
    }
  }
}
