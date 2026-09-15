import unittest
from scripts.xray_collector import observation, parse_sockets, Sessions, capabilities, torrent_observation


class XrayCollectorTest(unittest.TestCase):
    def test_ipv4_user_and_transport_without_browsing_destinations(self):
        event = observation('2026/09/15 16:13:09.341025 from 192.0.2.4:51234 accepted tcp:private.example:443 [inbound >> DIRECT] email: 12345', 1000)
        self.assertEqual((event['ip'], event['user'], event['protocol']), ('192.0.2.4', '12345', 'TCP'))
        self.assertNotIn('private.example', str(event))
        next_event = observation('from tcp:192.0.2.4:62345 accepted tcp:other.example:80 [in >> out] email: 12345', 2000)
        self.assertEqual(event['id'], next_event['id'])
        self.assertEqual(next_event['time'], 2000)

    def test_ipv6_and_non_access_lines(self):
        event = observation('from [2001:db8::1]:1234 accepted udp:192.0.2.8:53 [in >> out] email: user-name', 1000)
        self.assertEqual(event['ip'], '2001:db8::1')
        self.assertEqual(event['protocol'], 'UDP')
        self.assertIsNone(observation('unrelated warning', 1000))
        self.assertIsNone(observation('from invalid accepted tcp:example:443 email: user', 1000))

    def test_socket_counters_normalize_ipv4_mapped_peers(self):
        rows = parse_sockets('0 0 [::ffff:192.0.2.1]:443 [::ffff:192.0.2.4]:51234 ino:123 sk:aa <->\n\t rtt:12.5/2 bytes_acked:400 bytes_received:200\n')
        self.assertEqual(rows[('192.0.2.4', 51234)]['bytes_received'], 200)
        self.assertEqual(rows[('192.0.2.4', 51234)]['rtt_ms'], 12.5)

    def test_observed_duration_deltas_and_reused_port_are_distinct(self):
        event = observation('from 192.0.2.4:51234 accepted tcp:hidden.example:443 [in >> out] email: 123', 1000)
        key = ('192.0.2.4', 51234)
        snapshot = {key: {'cookie': 'a', 'bytes_received': 100, 'bytes_acked': 200}}
        tracker = Sessions()
        tracker.observe(event, snapshot)
        snapshot[key].update(bytes_received=350, bytes_acked=700)
        row = tracker.sample(snapshot, 16000)[0]
        self.assertEqual((row['first_seen'], row['bytes_rx'], row['bytes_tx']), (1000, 250, 500))
        self.assertEqual(row['status'], 'online')
        restarted = Sessions(tracker.rows)
        self.assertEqual(restarted.sample(snapshot, 17000)[0]['first_seen'], 1000)
        snapshot[key]['cookie'] = 'b'
        self.assertEqual(tracker.sample(snapshot, 18000)[0]['status'], 'ended')
        event['time'] = 19000
        tracker.observe(event, snapshot)
        new = tracker.sample(snapshot, 20000)[0]
        self.assertNotEqual(new['id'], row['id'])
        self.assertEqual(new['bytes_rx'], 0)

    def test_shared_socket_never_assigns_the_whole_traffic_to_multiple_users(self):
        snapshot = {('192.0.2.4', 51234): {'cookie': 'a', 'bytes_received': 100, 'bytes_acked': 200}}
        tracker = Sessions()
        for user in ('one', 'two'):
            tracker.observe(observation(f'from 192.0.2.4:51234 accepted tcp:hidden.example:443 [in >> out] email: {user}', 1000), snapshot)
        self.assertTrue(all('bytes_rx' not in row for row in tracker.sample(snapshot, 2000)))
        self.assertTrue(all(row['status'] != 'ended' for row in tracker.sample(None, 3000)))

    def test_torrent_route_requires_existing_sniffing_and_exclusive_rule(self):
        config = {'inbounds': [{'port': 443, 'protocol': 'vless', 'tag': 'in', 'sniffing': {'enabled': True}}],
                  'routing': {'rules': [{'type': 'field', 'protocol': ['bittorrent'], 'outboundTag': 'TORRENT'}]}}
        ports, sniffed, tags = capabilities(config)
        self.assertEqual(ports, {443})
        line = 'from 192.0.2.4:51234 accepted tcp:hidden.example:443 [in >> TORRENT] email: 123'
        event = observation(line, 1000)
        detection = torrent_observation(line, event, sniffed, tags)
        self.assertEqual(detection['kind'], 'detection')
        self.assertNotIn('hidden.example', str(detection))
        self.assertIsNone(torrent_observation(line, event, set(), tags))
        config['routing']['rules'].append({'domain': ['example.com'], 'outboundTag': 'TORRENT'})
        self.assertFalse(capabilities(config)[2])
