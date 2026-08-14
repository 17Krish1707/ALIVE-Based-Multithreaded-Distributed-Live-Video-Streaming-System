public class VideoSource {

    private final String name;
    private final String type;
    private final int latency;
    private final int totalBandwidth;

    private int usedBandwidth;

    public VideoSource(
            String name,
            String type,
            int latency,
            int totalBandwidth) {

        this.name = name;
        this.type = type;
        this.latency = latency;
        this.totalBandwidth = totalBandwidth;
        this.usedBandwidth = 0;
    }

    public String getName() {
        return name;
    }

    public String getType() {
        return type;
    }

    public int getLatency() {
        return latency;
    }

    public synchronized int getAvailableBandwidth() {
        return totalBandwidth - usedBandwidth;
    }

    /*
     * synchronized prevents two client threads from
     * allocating the same bandwidth incorrectly.
     */
    public synchronized boolean allocateBandwidth(int amount) {

        if (usedBandwidth + amount <= totalBandwidth) {

            usedBandwidth += amount;

            return true;
        }

        return false;
    }

    public synchronized void releaseBandwidth(int amount) {

        usedBandwidth -= amount;

        if (usedBandwidth < 0) {
            usedBandwidth = 0;
        }
    }

    public synchronized int getUsedBandwidth() {
        return usedBandwidth;
    }
}